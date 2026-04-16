/**
 * Ordnet externe Medien einem Alarmfall zu und bereitet ihre Uebernahme in den Medienpfad vor.
 */
import { randomUUID } from "node:crypto";

import type {
  AlarmCaseRecord,
  AlarmMediaBundleSummary,
  AlarmMediaKind,
  ExternalAlarmMediaIngestionRequest,
  ExternalAlarmMediaIngestionResult,
  ParsedVendorMediaResult
} from "@leitstelle/contracts";
import { AppError, type AuditTrail, type Logger } from "@leitstelle/observability";

import type { AlarmCoreStore } from "./types.js";
import { buildVendorMediaCorrelationKey, parseVendorMediaFilename, parseVendorMediaPath } from "./vendor-media-parser.js";
import { getDefaultMediaBundleProfileKey, mediaBundleProfiles } from "./vendor-profiles.js";

export type ExternalAlarmMediaIngestionService = {
  ingestReference: (
    input: ExternalAlarmMediaIngestionRequest,
    requestId: string,
    providedSharedSecret?: string
  ) => Promise<ExternalAlarmMediaIngestionResult>;
  attachPendingMediaToAlarmCase: (input: {
    alarmCaseId: string;
    siteId: string;
    componentId?: string;
    vendor: string;
    sourceType: string;
    externalEventId?: string;
    correlationKey?: string;
    alarmType?: AlarmCaseRecord["alarmType"];
    sourceOccurredAt?: string;
  }) => Promise<number>;
};

type CreateExternalAlarmMediaIngestionServiceInput = {
  store: AlarmCoreStore;
  audit: AuditTrail;
  logger: Logger;
  sharedSecret?: string;
  correlationToleranceSeconds: number;
  vendorCorrelationToleranceSeconds?: Partial<Record<string, number>>;
};

export function createExternalAlarmMediaIngestionService(
  input: CreateExternalAlarmMediaIngestionServiceInput
): ExternalAlarmMediaIngestionService {
  return {
    async ingestReference(payload, requestId, providedSharedSecret) {
      assertSharedSecret(input.sharedSecret, providedSharedSecret);

      const initiallyParsedMedia = parseIncomingVendorMedia(payload);
      const canonicalStorageKey = buildVendorMediaStorageKey(initiallyParsedMedia.ok ? initiallyParsedMedia.parsed : undefined, payload.storageKey);
      const existing = await input.store.getVendorMediaInboxByStorageKey(payload.storageKey)
        ?? (canonicalStorageKey !== payload.storageKey ? await input.store.getVendorMediaInboxByStorageKey(canonicalStorageKey) : null);
      if (existing) {
        input.logger.info("alarm.media.external_ingestion.duplicate", {
          requestId,
          inboxId: existing.id,
          storageKey: payload.storageKey
        });
        return {
          status: "duplicate",
          inboxId: existing.id,
          ...(existing.correlationKey ? { correlationKey: existing.correlationKey } : {}),
          ...(existing.alarmCaseId ? { matchedAlarmCaseId: existing.alarmCaseId } : {}),
          ...(existing.attachedMediaId ? { attachedMediaId: existing.attachedMediaId } : {}),
          ...(existing.parseError ? { parseError: existing.parseError } : {})
        };
      }

      const parsedMedia = initiallyParsedMedia;
      const parsedChannelNumber = parsedMedia.ok && parsedMedia.parsed ? parseChannelNumber(parsedMedia.parsed.channelId) : undefined;
      const mapping = parsedMedia.ok && parsedMedia.parsed
        ? await input.store.resolveAlarmSourceMapping({
            sourceSystem: payload.vendor,
            sourceType: payload.sourceType,
            ...(parsedMedia.parsed.externalDeviceId ? { externalDeviceId: parsedMedia.parsed.externalDeviceId } : {}),
            ...(parsedMedia.parsed.externalRecorderId ? { externalRecorderId: parsedMedia.parsed.externalRecorderId } : {}),
            ...(parsedChannelNumber !== undefined ? { channelNumber: parsedChannelNumber } : {}),
            ...(parsedMedia.parsed.sourceName ? { sourceName: parsedMedia.parsed.sourceName } : { sourceName: parsedMedia.parsed.sourceId }),
            ...(parsedMedia.parsed.serialNumber ? { serialNumber: parsedMedia.parsed.serialNumber } : {})
          })
        : null;
      const mediaBundleProfileKey = mapping?.mediaBundleProfileKey ?? getDefaultMediaBundleProfileKey(payload.vendor, payload.sourceType);
      const inboxEntry = await input.store.createVendorMediaInboxEntry({
        id: randomUUID(),
        vendor: payload.vendor.trim().toLowerCase(),
        sourceType: payload.sourceType.trim().toLowerCase(),
        ...(parsedMedia.ok && parsedMedia.parsed ? { parserKey: parsedMedia.parsed.parserKey } : {}),
        mediaBundleProfileKey,
        storageKey: canonicalStorageKey,
        ...(resolveOriginalFilename(payload) ? { originalFilename: resolveOriginalFilename(payload)! } : {}),
        ...(payload.relativePath?.trim() ? { relativePath: payload.relativePath.trim() } : {}),
        ...(payload.mimeType?.trim() ? { mimeType: payload.mimeType.trim() } : {}),
        mediaKind: parsedMedia.ok && parsedMedia.parsed ? parsedMedia.parsed.mediaKind : inferAlarmMediaKind(payload),
        ...(parsedMedia.ok && parsedMedia.parsed?.sequenceNo ? { sequenceNo: parsedMedia.parsed.sequenceNo } : {}),
        ...(parsedMedia.ok && parsedMedia.parsed ? { sourceId: parsedMedia.parsed.sourceId } : {}),
        ...(parsedMedia.ok && parsedMedia.parsed?.channelId ? { channelId: parsedMedia.parsed.channelId } : {}),
        ...(parsedMedia.ok && parsedMedia.parsed ? { eventType: parsedMedia.parsed.eventType, eventTs: parsedMedia.parsed.eventTs } : {}),
        ...(parsedMedia.ok && parsedMedia.parsed?.vendorEventId ? { vendorEventId: parsedMedia.parsed.vendorEventId } : {}),
        ...(parsedMedia.ok && parsedMedia.parsed ? { correlationKey: parsedMedia.parsed.correlationKey } : {}),
        ...(mapping?.siteId ? { siteId: mapping.siteId } : {}),
        ...(mapping?.componentId ? { componentId: mapping.componentId } : {}),
        ...(mapping?.nvrComponentId ? { nvrComponentId: mapping.nvrComponentId } : {}),
        status: parsedMedia.ok && mapping ? "pending" : "orphaned",
        ...(parsedMedia.ok ? {} : { parseError: parsedMedia.error }),
        metadata: {
          ...(payload.metadata ? payload.metadata : {}),
          originalStorageKey: payload.storageKey
        }
      });

      const matchedAlarmCase = parsedMedia.ok && parsedMedia.parsed
        ? await resolveAlarmCaseForVendorMedia(
            input.store,
            parsedMedia.parsed,
            mapping?.siteId,
            mapping?.componentId,
            resolveCorrelationToleranceSeconds(input, payload.vendor)
          )
        : null;
      if (!matchedAlarmCase || !parsedMedia.ok || !parsedMedia.parsed) {
        input.logger.info("alarm.media.external_ingestion.pending", {
          requestId,
          inboxId: inboxEntry.id,
          vendor: payload.vendor,
          sourceType: payload.sourceType,
          matchedAlarmCaseId: matchedAlarmCase?.id ?? null
        });
        await recordAudit(input.audit, requestId, "alarm.media.external_ingestion.pending", inboxEntry.id, {
          vendor: payload.vendor,
          sourceType: payload.sourceType,
          ...(parsedMedia.ok && parsedMedia.parsed ? { correlationKey: parsedMedia.parsed.correlationKey } : {}),
          status: matchedAlarmCase ? "pending" : "orphaned"
        });
        return {
          status: matchedAlarmCase ? "pending" : "orphaned",
          inboxId: inboxEntry.id,
          ...(parsedMedia.ok && parsedMedia.parsed ? { correlationKey: parsedMedia.parsed.correlationKey, parsedMedia: parsedMedia.parsed } : {}),
          ...(parsedMedia.ok ? {} : { parseError: parsedMedia.error })
        };
      }

      const attachedMedia = await attachInboxEntryToAlarmCase(input.store, inboxEntry.id, matchedAlarmCase, parsedMedia.parsed, mediaBundleProfileKey, payload);
      input.logger.info("alarm.media.external_ingestion.attached", {
        requestId,
        inboxId: inboxEntry.id,
        alarmCaseId: matchedAlarmCase.id,
        mediaId: attachedMedia.id,
        correlationKey: parsedMedia.parsed.correlationKey
      });
      await recordAudit(input.audit, requestId, "alarm.media.external_ingestion.attached", inboxEntry.id, {
        alarmCaseId: matchedAlarmCase.id,
        mediaId: attachedMedia.id,
        correlationKey: parsedMedia.parsed.correlationKey
      });

      return {
        status: "attached",
        inboxId: inboxEntry.id,
        correlationKey: parsedMedia.parsed.correlationKey,
        matchedAlarmCaseId: matchedAlarmCase.id,
        attachedMediaId: attachedMedia.id,
        parsedMedia: parsedMedia.parsed,
        ...(buildBundleSummaryFromMedia([attachedMedia], mediaBundleProfileKey)
          ? { bundle: buildBundleSummaryFromMedia([attachedMedia], mediaBundleProfileKey)! }
          : {})
      };
    },
    async attachPendingMediaToAlarmCase(matchInput) {
      const candidates = await input.store.listPendingVendorMediaInboxEntriesForAlarm({
        vendor: matchInput.vendor.trim().toLowerCase(),
        sourceType: matchInput.sourceType.trim().toLowerCase(),
        ...(matchInput.externalEventId ? { vendorEventId: matchInput.externalEventId } : {}),
        ...(matchInput.correlationKey ? { correlationKey: matchInput.correlationKey } : {}),
        ...(matchInput.siteId ? { siteId: matchInput.siteId } : {}),
        ...(matchInput.componentId ? { componentId: matchInput.componentId } : {}),
        ...(matchInput.alarmType ? { alarmType: matchInput.alarmType } : {}),
        ...(matchInput.sourceOccurredAt ? { sourceOccurredAt: matchInput.sourceOccurredAt } : {}),
        toleranceSeconds: resolveCorrelationToleranceSeconds(input, matchInput.vendor)
      });
      if (candidates.length === 0) {
        return 0;
      }

      const alarmCase = await input.store.getCaseById(matchInput.alarmCaseId);
      if (!alarmCase) {
        return 0;
      }

      let attachedCount = 0;
      for (const candidate of candidates) {
        if (!candidate.correlationKey || !candidate.sourceId || !candidate.eventType || !candidate.eventTs) {
          continue;
        }
        const attachedMedia = await attachInboxEntryToAlarmCase(
          input.store,
          candidate.id,
          alarmCase,
          {
            vendor: candidate.vendor,
            sourceType: candidate.sourceType,
            parserKey: candidate.parserKey ?? "pending-inbox",
            filename: candidate.originalFilename ?? candidate.storageKey,
            sourceId: candidate.sourceId,
            ...(candidate.channelId ? { channelId: candidate.channelId } : {}),
            eventType: candidate.eventType,
            eventTs: candidate.eventTs,
            ...(candidate.vendorEventId ? { vendorEventId: candidate.vendorEventId } : {}),
            correlationKey: candidate.correlationKey,
            mediaKind: candidate.mediaKind,
            mediaType: candidate.mediaKind === "clip" ? "clip" : "image",
            ...(candidate.sequenceNo ? { sequenceNo: candidate.sequenceNo } : {})
          },
          candidate.mediaBundleProfileKey ?? getDefaultMediaBundleProfileKey(candidate.vendor, candidate.sourceType),
          {
            vendor: candidate.vendor,
            sourceType: candidate.sourceType,
            storageKey: candidate.storageKey,
            ...(candidate.originalFilename ? { filename: candidate.originalFilename } : {}),
            ...(candidate.relativePath ? { relativePath: candidate.relativePath } : {}),
            ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
            ...(candidate.eventTs ? { capturedAt: candidate.eventTs } : {}),
            ...(candidate.metadata ? { metadata: candidate.metadata } : {})
          }
        );
        if (attachedMedia.id) {
          attachedCount += 1;
        }
      }

      return attachedCount;
    }
  };
}

async function resolveAlarmCaseForVendorMedia(
  store: AlarmCoreStore,
  parsedMedia: ParsedVendorMediaResult,
  siteId: string | undefined,
  componentId: string | undefined,
  toleranceSeconds: number
): Promise<AlarmCaseRecord | null> {
  if (parsedMedia.vendorEventId) {
    const byVendorEvent = await store.getCaseByExternalSourceRef(
      `${parsedMedia.vendor}:${parsedMedia.sourceType}:${parsedMedia.vendorEventId}`
    );
    if (byVendorEvent) {
      return byVendorEvent;
    }
  }

  const byCorrelationKey = await store.findCaseByVendorCorrelationKey(parsedMedia.correlationKey);
  if (byCorrelationKey) {
    return byCorrelationKey;
  }

  if (siteId && componentId) {
    const exactMatch = await store.findCaseByComponentEventTime({
      siteId,
      componentId,
      alarmType: parsedMedia.eventType as AlarmCaseRecord["alarmType"],
      sourceOccurredAt: parsedMedia.eventTs,
      toleranceSeconds: 0
    });
    if (exactMatch) {
      return exactMatch;
    }

    return await store.findCaseByComponentEventTime({
      siteId,
      componentId,
      alarmType: parsedMedia.eventType as AlarmCaseRecord["alarmType"],
      sourceOccurredAt: parsedMedia.eventTs,
      toleranceSeconds
    });
  }

  return null;
}

async function attachInboxEntryToAlarmCase(
  store: AlarmCoreStore,
  inboxId: string,
  alarmCase: AlarmCaseRecord,
  parsedMedia: ParsedVendorMediaResult,
  mediaBundleProfileKey: keyof typeof mediaBundleProfiles,
  payload: ExternalAlarmMediaIngestionRequest
) {
  const profile = mediaBundleProfiles[mediaBundleProfileKey];
  const storageKey = buildVendorMediaStorageKey(parsedMedia, payload.storageKey);
  const media = await store.attachMedia({
    alarmCaseId: alarmCase.id,
    mediaKind: parsedMedia.mediaKind,
    storageKey,
    ...(alarmCase.primaryDeviceId ? { deviceId: alarmCase.primaryDeviceId } : {}),
    ...(payload.mimeType?.trim() ? { mimeType: payload.mimeType.trim() } : {}),
    capturedAt: parsedMedia.eventTs,
    isPrimary: parsedMedia.mediaKind === "snapshot" && parsedMedia.sequenceNo === 1,
    metadata: {
      ...(payload.metadata ? payload.metadata : {}),
      vendor: parsedMedia.vendor,
      sourceType: parsedMedia.sourceType,
      sourceId: parsedMedia.sourceId,
      ...(parsedMedia.channelId ? { channelId: parsedMedia.channelId } : {}),
      eventType: parsedMedia.eventType,
      eventTs: parsedMedia.eventTs,
      ...(parsedMedia.vendorEventId ? { vendorEventId: parsedMedia.vendorEventId } : {}),
      correlationKey: parsedMedia.correlationKey,
      mediaKind: parsedMedia.mediaKind,
      mediaBundleProfileKey,
      expectedImages: profile.expectedImages,
      expectedClips: profile.expectedClips,
      siteId: alarmCase.siteId,
      ...(alarmCase.primaryDeviceId ? { componentId: alarmCase.primaryDeviceId } : {}),
      ...(payload.relativePath?.trim() ? { relativePath: payload.relativePath.trim() } : {}),
      originalStorageKey: payload.storageKey,
      ...(parsedMedia.sequenceNo ? { sequenceNo: parsedMedia.sequenceNo } : {})
    }
  });
  await store.appendEvent({
    alarmCaseId: alarmCase.id,
    eventKind: "media_attached",
    message: "External vendor media attached to alarm case.",
    payload: {
      mediaId: media.id,
      storageKey,
      vendor: parsedMedia.vendor,
      sourceType: parsedMedia.sourceType,
      correlationKey: parsedMedia.correlationKey
    }
  });
  await store.updateVendorMediaInboxEntry(inboxId, {
    status: "attached",
    alarmCaseId: alarmCase.id,
    attachedMediaId: media.id,
    siteId: alarmCase.siteId,
    ...(alarmCase.primaryDeviceId ? { componentId: alarmCase.primaryDeviceId } : {})
  });
  return media;
}

function parseIncomingVendorMedia(payload: ExternalAlarmMediaIngestionRequest) {
  if (payload.relativePath?.trim()) {
    return parseVendorMediaPath(payload.vendor, payload.sourceType, payload.relativePath.trim());
  }
  if (payload.filename?.trim()) {
    return parseVendorMediaFilename(payload.vendor, payload.sourceType, payload.filename.trim());
  }
  const filename = resolveOriginalFilename(payload);
  if (!filename) {
    return {
      ok: false,
      error: "Media ingestion requires a filename or relative path."
    } as const;
  }
  return parseVendorMediaFilename(payload.vendor, payload.sourceType, filename);
}

function buildVendorMediaStorageKey(parsedMedia: ParsedVendorMediaResult | undefined, originalStorageKey: string): string {
  if (!parsedMedia) {
    return originalStorageKey;
  }
  const eventDate = new Date(parsedMedia.eventTs);
  if (Number.isNaN(eventDate.getTime())) {
    return originalStorageKey;
  }
  const isoWeek = getIsoWeek(eventDate);
  const day = String(eventDate.getUTCDate()).padStart(2, "0");
  const month = String(eventDate.getUTCMonth() + 1).padStart(2, "0");
  const filename = parsedMedia.filename;
  return `/alarms/${eventDate.getUTCFullYear()}/${month}/KW${String(isoWeek).padStart(2, "0")}/${day}/${parsedMedia.sourceId}/${parsedMedia.correlationKey}/${filename}`;
}

function resolveOriginalFilename(payload: ExternalAlarmMediaIngestionRequest): string | undefined {
  if (payload.filename?.trim()) {
    return payload.filename.trim();
  }
  if (payload.relativePath?.trim()) {
    return payload.relativePath.replaceAll("\\", "/").split("/").filter(Boolean).at(-1);
  }
  const normalizedStorageKey = payload.storageKey.replaceAll("\\", "/");
  return normalizedStorageKey.split("/").filter(Boolean).at(-1);
}

function inferAlarmMediaKind(payload: ExternalAlarmMediaIngestionRequest): AlarmMediaKind {
  const filename = resolveOriginalFilename(payload)?.toLowerCase() ?? "";
  if (filename.endsWith(".mp4") || payload.mimeType?.startsWith("video/")) {
    return "clip";
  }
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(filename) || payload.mimeType?.startsWith("image/")) {
    return "snapshot";
  }
  return "other";
}

function parseChannelNumber(channelId: string | undefined): number | undefined {
  if (!channelId?.trim()) {
    return undefined;
  }
  const numeric = /\d+/.exec(channelId);
  return numeric ? Number(numeric[0]) : undefined;
}

function resolveCorrelationToleranceSeconds(
  input: Pick<CreateExternalAlarmMediaIngestionServiceInput, "correlationToleranceSeconds" | "vendorCorrelationToleranceSeconds">,
  vendor: string
): number {
  const normalizedVendor = vendor.trim().toLowerCase();
  const vendorSpecific = input.vendorCorrelationToleranceSeconds?.[normalizedVendor];
  return Math.max(0, vendorSpecific ?? input.correlationToleranceSeconds ?? 30);
}

function buildBundleSummaryFromMedia(
  media: Array<{ id: string; metadata?: Record<string, unknown> }>,
  mediaBundleProfileKey: keyof typeof mediaBundleProfiles
): AlarmMediaBundleSummary | undefined {
  const first = media[0];
  const metadata = first?.metadata;
  if (!metadata || typeof metadata["correlationKey"] !== "string" || typeof metadata["vendor"] !== "string" || typeof metadata["sourceType"] !== "string" || typeof metadata["sourceId"] !== "string" || typeof metadata["eventType"] !== "string" || typeof metadata["eventTs"] !== "string") {
    return undefined;
  }
  const profile = mediaBundleProfiles[mediaBundleProfileKey];
  const receivedImages = media.filter((entry) => entry.metadata?.["mediaKind"] !== "clip").length;
  const receivedClips = media.filter((entry) => entry.metadata?.["mediaKind"] === "clip").length;
  return {
    correlationKey: metadata["correlationKey"],
    vendor: metadata["vendor"],
    sourceType: metadata["sourceType"],
    sourceId: metadata["sourceId"],
    eventType: metadata["eventType"],
    eventTs: metadata["eventTs"],
    mediaBundleProfileKey,
    expectedImages: profile.expectedImages,
    expectedClips: profile.expectedClips,
    receivedImages,
    receivedClips,
    completenessState: receivedImages >= profile.expectedImages && receivedClips >= profile.expectedClips ? "complete" : "partial",
    mediaIds: media.map((entry) => entry.id),
    ...(typeof metadata["siteId"] === "string" ? { siteId: metadata["siteId"] } : {}),
    ...(typeof metadata["componentId"] === "string" ? { componentId: metadata["componentId"] } : {}),
    ...(typeof metadata["channelId"] === "string" ? { channelId: metadata["channelId"] } : {}),
    ...(typeof metadata["vendorEventId"] === "string" ? { vendorEventId: metadata["vendorEventId"] } : {})
  };
}

async function recordAudit(
  audit: AuditTrail,
  requestId: string,
  action: string,
  subjectId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await audit.record(
    {
      category: "alarm.media",
      action,
      outcome: "success",
      subjectId,
      metadata
    },
    { requestId }
  );
}

function assertSharedSecret(expected: string | undefined, provided: string | undefined): void {
  if (!expected) {
    return;
  }
  if (!provided?.trim()) {
    throw new AppError("External media ingestion key is required.", {
      status: 401,
      code: "ALARM_MEDIA_INGESTION_KEY_REQUIRED"
    });
  }
  if (provided.trim() !== expected) {
    throw new AppError("External media ingestion key is invalid.", {
      status: 403,
      code: "ALARM_MEDIA_INGESTION_KEY_INVALID"
    });
  }
}

function getIsoWeek(value: Date): number {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}