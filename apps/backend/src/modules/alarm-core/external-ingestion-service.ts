import type {
  AlarmEventRecord,
  AlarmIngestionRequest,
  ExternalAlarmDeviceReference,
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  ExternalAlarmMediaInput
} from "@leitstelle/contracts";
import { AppError, type AuditTrail, type Logger } from "@leitstelle/observability";

import type { AlarmCoreStore } from "./types.js";
import type { ExternalAlarmMediaIngestionService } from "./external-media-ingestion-service.js";
import type { AlarmIngestionService } from "./service.js";
import { buildVendorMediaCorrelationKey } from "./vendor-media-parser.js";

export type ExternalAlarmIngestionService = {
  ingest: (input: ExternalAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateExternalAlarmIngestionServiceInput = {
  store: AlarmCoreStore;
  alarmIngestion: AlarmIngestionService;
  mediaCorrelation?: Pick<ExternalAlarmMediaIngestionService, "attachPendingMediaToAlarmCase">;
  audit: AuditTrail;
  logger: Logger;
  sharedSecret?: string;
};

export function createExternalAlarmIngestionService(
  input: CreateExternalAlarmIngestionServiceInput
): ExternalAlarmIngestionService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      assertSharedSecret(input.sharedSecret, providedSharedSecret);

      const externalSourceRef = buildExternalSourceRef(payload);
      const duplicateCase = await input.store.getCaseByExternalSourceRef(externalSourceRef);

      if (duplicateCase) {
        const resolution = {
          sourceSystem: payload.sourceSystem.trim(),
          sourceType: payload.sourceType.trim(),
          externalEventId: payload.externalEventId.trim(),
          externalSourceRef,
          siteId: duplicateCase.siteId,
          ...(duplicateCase.primaryDeviceId ? { primaryDeviceId: duplicateCase.primaryDeviceId } : {})
        };
        const events = await input.store.listEventsByCaseId(duplicateCase.id);
        const media = await input.store.listMediaByCaseId(duplicateCase.id);
        await input.audit.record(
          {
            category: "alarm.ingestion",
            action: "alarm.external_ingestion.duplicate",
            outcome: "success",
            subjectId: duplicateCase.id,
            metadata: resolution
          },
          { requestId }
        );
        input.logger.info("alarm.external_ingestion.duplicate", {
          requestId,
          alarmCaseId: duplicateCase.id,
          ...resolution
        });
        return {
          alarmCase: duplicateCase,
          events,
          media,
          acceptedAsTechnicalError: duplicateCase.technicalState !== "complete",
          duplicate: true,
          resolution
        };
      }

      const resolvedSource = await resolveAlarmSource(input.store, payload);
      const primaryDeviceId = resolvedSource.primaryDeviceId;
      const siteId = await resolveSiteId(input.store, payload.siteId, resolvedSource.siteId, primaryDeviceId);

      if (primaryDeviceId) {
        await ensureDeviceMatchesSite(input.store, primaryDeviceId, siteId);
      }

      const resolution = {
        sourceSystem: payload.sourceSystem.trim(),
        sourceType: payload.sourceType.trim(),
        externalEventId: payload.externalEventId.trim(),
        externalSourceRef,
        siteId,
        ...(primaryDeviceId ? { primaryDeviceId } : {}),
        ...(resolvedSource.mappingId ? { mappingId: resolvedSource.mappingId } : {}),
        ...(resolvedSource.matchedBy ? { matchedBy: resolvedSource.matchedBy } : {})
      };

      const normalizedMedia = await normalizeMedia(input.store, payload.media ?? [], siteId);
      const normalizedPriority = normalizeSeverity(payload.severity);
      const vendorCorrelationKey = buildVendorCorrelationKeyFromAlarmPayload(payload);
      const technicalDetails = buildTechnicalDetails(payload, vendorCorrelationKey);
      const normalizedPayload: AlarmIngestionRequest = {
        siteId,
        alarmType: payload.eventType,
        sourceOccurredAt: payload.eventTime,
        externalSourceRef,
        ...(primaryDeviceId ? { primaryDeviceId } : {}),
        ...(normalizedPriority ? { priority: normalizedPriority } : {}),
        ...(payload.title?.trim() ? { title: payload.title.trim() } : {}),
        ...(payload.description?.trim() ? { description: payload.description.trim() } : {}),
        ...(payload.rawPayload ? { sourcePayload: payload.rawPayload } : {}),
        ...(technicalDetails ? { technicalDetails } : {}),
        ...(normalizedMedia.length > 0 ? { media: normalizedMedia } : {})
      };

      const result = await input.alarmIngestion.ingest(normalizedPayload, requestId);
      const mappingEvent = await input.store.appendEvent(buildMappingEvent(result.alarmCase.id, resolution, payload));
      if (input.mediaCorrelation) {
        await input.mediaCorrelation.attachPendingMediaToAlarmCase({
          alarmCaseId: result.alarmCase.id,
          siteId,
          ...(primaryDeviceId ? { componentId: primaryDeviceId } : {}),
          vendor: payload.sourceSystem,
          sourceType: payload.sourceType,
          externalEventId: payload.externalEventId,
          ...(vendorCorrelationKey ? { correlationKey: vendorCorrelationKey } : {}),
          alarmType: result.alarmCase.alarmType,
          sourceOccurredAt: payload.eventTime
        });
      }

      await input.audit.record(
        {
          category: "alarm.ingestion",
          action: "alarm.external_ingestion.accepted",
          outcome: "success",
          subjectId: result.alarmCase.id,
          metadata: {
            ...resolution,
            mediaCount: normalizedMedia.length,
            technicalState: result.alarmCase.technicalState
          }
        },
        { requestId }
      );
      input.logger.info("alarm.external_ingestion.accepted", {
        requestId,
        alarmCaseId: result.alarmCase.id,
        ...resolution,
        mediaCount: normalizedMedia.length
      });

      return {
        ...result,
        events: [...result.events, mappingEvent],
        duplicate: false,
        resolution
      };
    }
  };
}

async function resolveSiteId(
  store: AlarmCoreStore,
  providedSiteId: string | undefined,
  mappedSiteId: string | undefined,
  resolvedDeviceId: string | undefined
): Promise<string> {
  if (providedSiteId) {
    if (!(await store.hasSite(providedSiteId))) {
      throw new AppError("External alarm site is unknown.", {
        status: 404,
        code: "ALARM_EXTERNAL_SITE_NOT_FOUND"
      });
    }
    return providedSiteId;
  }

  if (mappedSiteId) {
    return mappedSiteId;
  }

  if (!resolvedDeviceId) {
    throw new AppError("External alarm requires a known site or a resolvable device reference.", {
      status: 400,
      code: "ALARM_EXTERNAL_SITE_REQUIRED"
    });
  }

  const siteId = await store.resolveSiteIdByDeviceId(resolvedDeviceId);
  if (!siteId) {
    throw new AppError("External alarm device is not linked to a site.", {
      status: 409,
      code: "ALARM_EXTERNAL_DEVICE_SITE_MISSING"
    });
  }
  return siteId;
}

async function resolveAlarmSource(
  store: AlarmCoreStore,
  payload: ExternalAlarmIngestionRequest
): Promise<{ siteId?: string; primaryDeviceId?: string; mappingId?: string; matchedBy?: ExternalAlarmIngestionResult["resolution"]["matchedBy"] }> {
  const directDeviceId = await resolveDirectDeviceId(store, toDeviceReference(payload));
  if (directDeviceId) {
    return {
      primaryDeviceId: directDeviceId,
      matchedBy: "direct_device_id"
    };
  }

  const mapping = await store.resolveAlarmSourceMapping({
    ...(payload.siteId ? { siteId: payload.siteId } : {}),
    sourceSystem: payload.sourceSystem,
    sourceType: payload.sourceType,
    ...(payload.externalDeviceId ? { externalDeviceId: payload.externalDeviceId } : {}),
    ...(payload.externalRecorderId ? { externalRecorderId: payload.externalRecorderId } : {}),
    ...(payload.deviceSerialNumber ? { serialNumber: payload.deviceSerialNumber } : {}),
    ...(payload.channelNumber !== undefined ? { channelNumber: payload.channelNumber } : {}),
    ...(payload.analyticsName ? { analyticsName: payload.analyticsName } : {}),
    ...(payload.sourceName ? { sourceName: payload.sourceName } : {}),
    ...(payload.eventNamespace ? { eventNamespace: payload.eventNamespace } : {})
  });
  if (mapping) {
    return {
      siteId: mapping.siteId,
      primaryDeviceId: mapping.componentId,
      mappingId: mapping.mappingId,
      matchedBy: "alarm_source_mapping"
    };
  }

  const fallbackDeviceId = await resolveDeviceReference(store, toDeviceReference(payload));
  if (!fallbackDeviceId) {
    return {};
  }

  return {
    primaryDeviceId: fallbackDeviceId,
    matchedBy: payload.deviceSerialNumber?.trim()
      ? "serial_number"
      : payload.deviceNetworkAddress?.trim()
        ? "network_address"
        : undefined
  };
}

async function resolveDirectDeviceId(
  store: AlarmCoreStore,
  reference: ExternalAlarmDeviceReference
): Promise<string | undefined> {
  const directId = reference.deviceId?.trim();
  if (directId) {
    if (!(await store.hasDevice(directId))) {
      throw new AppError("External alarm device is unknown.", {
        status: 404,
        code: "ALARM_EXTERNAL_DEVICE_NOT_FOUND"
      });
    }
    return directId;
  }

  return undefined;
}

async function resolveDeviceReference(
  store: AlarmCoreStore,
  reference: ExternalAlarmDeviceReference
): Promise<string | undefined> {
  const serialNumber = reference.deviceSerialNumber?.trim();
  if (serialNumber) {
    const deviceId = await store.resolveDeviceIdBySerialNumber(serialNumber);
    if (!deviceId) {
      throw new AppError("External alarm device serial number is unknown.", {
        status: 404,
        code: "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND"
      });
    }
    return deviceId;
  }

  const networkAddress = reference.deviceNetworkAddress?.trim();
  if (networkAddress) {
    const deviceId = await store.resolveDeviceIdByNetworkAddress(networkAddress);
    if (!deviceId) {
      throw new AppError("External alarm device network address is unknown.", {
        status: 404,
        code: "ALARM_EXTERNAL_DEVICE_ADDRESS_NOT_FOUND"
      });
    }
    return deviceId;
  }

  return undefined;
}

async function ensureDeviceMatchesSite(store: AlarmCoreStore, deviceId: string, siteId: string): Promise<void> {
  const deviceSiteId = await store.resolveSiteIdByDeviceId(deviceId);
  if (!deviceSiteId || deviceSiteId !== siteId) {
    throw new AppError("External alarm device does not belong to the resolved site.", {
      status: 409,
      code: "ALARM_EXTERNAL_SITE_DEVICE_MISMATCH"
    });
  }
}

async function normalizeMedia(
  store: AlarmCoreStore,
  media: ExternalAlarmMediaInput[],
  siteId: string
): Promise<NonNullable<AlarmIngestionRequest["media"]>> {
  const normalized: NonNullable<AlarmIngestionRequest["media"]> = [];
  for (const entry of media) {
    const mediaDeviceId = await resolveDeviceReference(store, toDeviceReference(entry));
    if (mediaDeviceId) {
      await ensureDeviceMatchesSite(store, mediaDeviceId, siteId);
    }
    normalized.push({
      storageKey: entry.storageKey,
      ...(mediaDeviceId ? { deviceId: mediaDeviceId } : {}),
      ...(entry.mediaKind?.trim() ? { mediaKind: entry.mediaKind.trim() } : {}),
      ...(entry.mimeType?.trim() ? { mimeType: entry.mimeType.trim() } : {}),
      ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
      ...(entry.isPrimary !== undefined ? { isPrimary: entry.isPrimary } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {})
    });
  }
  return normalized;
}

function buildExternalSourceRef(payload: ExternalAlarmIngestionRequest): string {
  return `${payload.sourceSystem.trim()}:${payload.sourceType.trim()}:${payload.externalEventId.trim()}`;
}

function normalizeSeverity(rawSeverity: string | undefined): AlarmIngestionRequest["priority"] | undefined {
  if (!rawSeverity?.trim()) {
    return undefined;
  }
  const severity = rawSeverity.trim().toLowerCase();
  switch (severity) {
    case "critical":
    case "major":
    case "emergency":
      return "critical";
    case "high":
    case "warning":
      return "high";
    case "normal":
    case "medium":
    case "low":
    case "info":
      return "normal";
    default:
      return undefined;
  }
}

function buildTechnicalDetails(
  payload: ExternalAlarmIngestionRequest,
  vendorCorrelationKey?: string
): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {
    externalSourceSystem: payload.sourceSystem.trim(),
    externalSourceType: payload.sourceType.trim(),
    externalEventId: payload.externalEventId.trim()
  };
  if (payload.zone?.trim()) {
    details["zone"] = payload.zone.trim();
  }
  if (payload.cameraName?.trim()) {
    details["cameraName"] = payload.cameraName.trim();
  }
  if (payload.deviceSerialNumber?.trim()) {
    details["deviceSerialNumber"] = payload.deviceSerialNumber.trim();
  }
  if (payload.deviceNetworkAddress?.trim()) {
    details["deviceNetworkAddress"] = payload.deviceNetworkAddress.trim();
  }
  if (payload.externalDeviceId?.trim()) {
    details["externalDeviceId"] = payload.externalDeviceId.trim();
  }
  if (payload.externalRecorderId?.trim()) {
    details["externalRecorderId"] = payload.externalRecorderId.trim();
  }
  if (payload.channelNumber !== undefined) {
    details["channelNumber"] = payload.channelNumber;
  }
  if (payload.analyticsName?.trim()) {
    details["analyticsName"] = payload.analyticsName.trim();
  }
  if (payload.sourceName?.trim()) {
    details["sourceName"] = payload.sourceName.trim();
  }
  if (payload.eventNamespace?.trim()) {
    details["eventNamespace"] = payload.eventNamespace.trim();
  }
  if (vendorCorrelationKey) {
    details["vendorCorrelationKey"] = vendorCorrelationKey;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function buildMappingEvent(
  alarmCaseId: string,
  resolution: ExternalAlarmIngestionResult["resolution"],
  payload: ExternalAlarmIngestionRequest
): { alarmCaseId: string; eventKind: "payload_updated"; message: string; payload: Record<string, unknown> } {
  return {
    alarmCaseId,
    eventKind: "payload_updated",
    message: "External source mapping recorded during ingestion.",
    payload: {
      sourceSystem: resolution.sourceSystem,
      sourceType: resolution.sourceType,
      externalEventId: resolution.externalEventId,
      externalSourceRef: resolution.externalSourceRef,
      siteId: resolution.siteId,
      ...(resolution.primaryDeviceId ? { primaryDeviceId: resolution.primaryDeviceId } : {}),
      ...(resolution.mappingId ? { mappingId: resolution.mappingId } : {}),
      ...(resolution.matchedBy ? { matchedBy: resolution.matchedBy } : {}),
      ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
      ...(payload.cameraName?.trim() ? { cameraName: payload.cameraName.trim() } : {}),
      ...(payload.externalDeviceId?.trim() ? { externalDeviceId: payload.externalDeviceId.trim() } : {}),
      ...(payload.externalRecorderId?.trim() ? { externalRecorderId: payload.externalRecorderId.trim() } : {}),
      ...(payload.channelNumber !== undefined ? { channelNumber: payload.channelNumber } : {}),
      ...(payload.analyticsName?.trim() ? { analyticsName: payload.analyticsName.trim() } : {}),
      ...(payload.sourceName?.trim() ? { sourceName: payload.sourceName.trim() } : {}),
      ...(payload.eventNamespace?.trim() ? { eventNamespace: payload.eventNamespace.trim() } : {})
    }
  };
}

function assertSharedSecret(expected: string | undefined, provided: string | undefined): void {
  if (!expected) {
    return;
  }
  if (!provided?.trim()) {
    throw new AppError("External alarm ingestion key is required.", {
      status: 401,
      code: "ALARM_EXTERNAL_INGESTION_KEY_REQUIRED"
    });
  }
  if (provided.trim() !== expected) {
    throw new AppError("External alarm ingestion key is invalid.", {
      status: 403,
      code: "ALARM_EXTERNAL_INGESTION_KEY_INVALID"
    });
  }
}

function toDeviceReference(reference: ExternalAlarmDeviceReference): ExternalAlarmDeviceReference {
  return {
    ...(reference.deviceId ? { deviceId: reference.deviceId } : {}),
    ...(reference.deviceSerialNumber ? { deviceSerialNumber: reference.deviceSerialNumber } : {}),
    ...(reference.deviceNetworkAddress ? { deviceNetworkAddress: reference.deviceNetworkAddress } : {}),
    ...(reference.externalDeviceId ? { externalDeviceId: reference.externalDeviceId } : {}),
    ...(reference.externalRecorderId ? { externalRecorderId: reference.externalRecorderId } : {}),
    ...(reference.channelNumber !== undefined ? { channelNumber: reference.channelNumber } : {}),
    ...(reference.analyticsName ? { analyticsName: reference.analyticsName } : {}),
    ...(reference.sourceName ? { sourceName: reference.sourceName } : {}),
    ...(reference.eventNamespace ? { eventNamespace: reference.eventNamespace } : {})
  };
}

function buildVendorCorrelationKeyFromAlarmPayload(payload: ExternalAlarmIngestionRequest): string | undefined {
  const sourceId = payload.sourceName?.trim() || payload.externalDeviceId?.trim() || payload.externalRecorderId?.trim();
  if (!sourceId) {
    return undefined;
  }
  return buildVendorMediaCorrelationKey({
    vendor: payload.sourceSystem,
    sourceType: payload.sourceType,
    sourceId,
    ...(payload.channelNumber !== undefined ? { channelId: `CH${String(payload.channelNumber).padStart(2, "0")}` } : {}),
    eventType: payload.eventType,
    eventTs: payload.eventTime
  });
}
