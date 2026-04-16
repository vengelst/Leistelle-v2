/**
 * Enthaelt die zentrale Fachlogik fuer Alarm-Ingestion, Statuswechsel und Fallfortschritt.
 */
import type {
  AlarmEventCreateInput,
  AlarmEventRecord,
  AlarmIngestionRequest,
  AlarmIngestionResult,
  AlarmMediaRecord,
  AlarmPriority,
  AlarmTechnicalState,
  AlarmType
} from "@leitstelle/contracts";
import { alarmMediaKinds, alarmPriorities, alarmTypes } from "@leitstelle/contracts";
import { AppError, type AuditTrail, type Logger } from "@leitstelle/observability";

import type { AlarmCoreStore } from "./types.js";

export type AlarmIngestionService = {
  ingest: (input: AlarmIngestionRequest, requestId: string) => Promise<AlarmIngestionResult>;
};

type CreateAlarmIngestionServiceInput = {
  store: AlarmCoreStore;
  audit: AuditTrail;
  logger: Logger;
};

export function createAlarmIngestionService(input: CreateAlarmIngestionServiceInput): AlarmIngestionService {
  return {
    async ingest(payload, requestId) {
      const siteExists = await input.store.hasSite(payload.siteId);

      if (!siteExists) {
        throw new AppError("Alarm site not found.", {
          status: 404,
          code: "ALARM_INGESTION_SITE_NOT_FOUND"
        });
      }

      const technicalReasons: string[] = [];
      let primaryDeviceId = payload.primaryDeviceId;

      if (primaryDeviceId && !(await input.store.hasDevice(primaryDeviceId))) {
        technicalReasons.push("primary_device_unknown");
        primaryDeviceId = undefined;
      }

      const normalizedType = normalizeAlarmType(payload.alarmType);
      if (!payload.alarmType?.trim()) {
        technicalReasons.push("alarm_type_missing");
      } else if (!isRecognizedAlarmType(payload.alarmType)) {
        technicalReasons.push(payload.alarmType ? "alarm_type_unknown" : "alarm_type_missing");
      }

      const title = normalizeTitle(payload.title, normalizedType);
      if (!payload.title?.trim()) {
        technicalReasons.push("title_missing");
      }

      if (!primaryDeviceId) {
        technicalReasons.push("primary_device_missing");
      }

      const technicalState: AlarmTechnicalState = technicalReasons.length > 0 ? "incomplete" : "complete";
      const priority = resolvePriority(payload.priority, normalizedType, technicalState);
      const mergedTechnicalDetails = mergeTechnicalDetails(payload.technicalDetails, technicalReasons, payload);

      const alarmCase = await input.store.createCase({
        siteId: payload.siteId,
        alarmType: normalizedType,
        priority,
        lifecycleStatus: "received",
        assessmentStatus: "pending",
        technicalState,
        title,
        receivedAt: new Date().toISOString(),
        ...(primaryDeviceId ? { primaryDeviceId } : {}),
        ...(payload.externalSourceRef ? { externalSourceRef: payload.externalSourceRef } : {}),
        ...(technicalReasons.length > 0 ? { incompleteReason: technicalReasons.join(",") } : {}),
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.sourceOccurredAt ? { sourceOccurredAt: payload.sourceOccurredAt } : {}),
        ...(payload.sourcePayload ? { sourcePayload: payload.sourcePayload } : {}),
        ...(mergedTechnicalDetails ? { technicalDetails: mergedTechnicalDetails } : {})
      });

      const events: AlarmEventRecord[] = [];
      events.push(
        await input.store.appendEvent({
          alarmCaseId: alarmCase.id,
          eventKind: "case_created",
          message: technicalState === "complete" ? "Alarm accepted." : "Alarm accepted with technical issues.",
          payload: {
            alarmType: alarmCase.alarmType,
            priority: alarmCase.priority,
            technicalState: alarmCase.technicalState
          }
        })
      );

      if (technicalReasons.length > 0) {
        events.push(
          await input.store.appendEvent({
            alarmCaseId: alarmCase.id,
            eventKind: "technical_state_changed",
            message: "Alarm marked as technically incomplete during ingestion.",
            payload: {
              technicalReasons
            }
          })
        );
      }

      const persistedMedia: AlarmMediaRecord[] = [];
      for (const mediaItem of payload.media ?? []) {
        let mediaDeviceId = mediaItem.deviceId;

        if (mediaDeviceId && !(await input.store.hasDevice(mediaDeviceId))) {
          mediaDeviceId = undefined;
          technicalReasons.push(`media_device_unknown:${mediaItem.storageKey}`);
        }

        const savedMedia = await input.store.attachMedia({
          alarmCaseId: alarmCase.id,
          mediaKind: normalizeMediaKind(mediaItem.mediaKind),
          storageKey: mediaItem.storageKey,
          ...(mediaDeviceId ? { deviceId: mediaDeviceId } : {}),
          ...(mediaItem.mimeType ? { mimeType: mediaItem.mimeType } : {}),
          ...(mediaItem.capturedAt ? { capturedAt: mediaItem.capturedAt } : {}),
          ...(mediaItem.isPrimary !== undefined ? { isPrimary: mediaItem.isPrimary } : {}),
          ...(mediaItem.metadata ? { metadata: mediaItem.metadata } : {})
        });
        persistedMedia.push(savedMedia);

        events.push(
          await input.store.appendEvent(buildMediaEvent(alarmCase.id, savedMedia))
        );
      }

      await input.audit.record(
        {
          category: "alarm.ingestion",
          action: technicalState === "complete" ? "alarm.ingestion.accepted" : "alarm.ingestion.accepted_with_issues",
          outcome: "success",
          subjectId: alarmCase.id,
          metadata: {
            siteId: alarmCase.siteId,
            alarmType: alarmCase.alarmType,
            priority: alarmCase.priority,
            technicalState: alarmCase.technicalState,
            mediaCount: persistedMedia.length,
            technicalReasons
          }
        },
        { requestId }
      );

      input.logger.info("alarm.ingestion.accepted", {
        requestId,
        alarmCaseId: alarmCase.id,
        siteId: alarmCase.siteId,
        alarmType: alarmCase.alarmType,
        priority: alarmCase.priority,
        technicalState: alarmCase.technicalState,
        mediaCount: persistedMedia.length
      });

      return {
        alarmCase,
        events,
        media: persistedMedia,
        acceptedAsTechnicalError: technicalState !== "complete"
      };
    }
  };
}

function normalizeAlarmType(rawType: string | undefined): AlarmType {
  if (!rawType) {
    return "other_disturbance";
  }

  const normalized = rawType.trim().toLowerCase();
  const alias = alarmTypeAliases[normalized];
  if (alias) {
    return alias;
  }

  return (alarmTypes as readonly string[]).includes(normalized) ? (normalized as AlarmType) : "other_disturbance";
}

function normalizeMediaKind(rawKind: string | undefined): AlarmMediaRecord["mediaKind"] {
  if (!rawKind) {
    return "other";
  }

  const normalized = rawKind.trim().toLowerCase();
  return (alarmMediaKinds as readonly string[]).includes(normalized) ? (normalized as AlarmMediaRecord["mediaKind"]) : "other";
}

function resolvePriority(rawPriority: string | undefined, alarmType: AlarmType, technicalState: AlarmTechnicalState): AlarmPriority {
  const normalized = rawPriority?.trim().toLowerCase();
  if (normalized && (alarmPriorities as readonly string[]).includes(normalized)) {
    return normalized as AlarmPriority;
  }

  if (technicalState !== "complete") {
    return "normal";
  }

  switch (alarmType) {
    case "motion":
    case "line_crossing":
    case "area_entry":
    case "sabotage":
      return "high";
    case "video_loss":
    case "camera_offline":
    case "nvr_offline":
    case "router_offline":
    case "technical":
    case "other_disturbance":
      return "normal";
  }
}

function normalizeTitle(title: string | undefined, alarmType: AlarmType): string {
  const normalized = title?.trim();
  if (normalized) {
    return normalized;
  }

  switch (alarmType) {
    case "motion":
      return "Motion Alarm";
    case "line_crossing":
      return "Line Crossing Alarm";
    case "area_entry":
      return "Area Entry Alarm";
    case "sabotage":
      return "Sabotage Alarm";
    case "video_loss":
      return "Video Loss Alarm";
    case "camera_offline":
      return "Camera Offline Alarm";
    case "nvr_offline":
      return "NVR Offline Alarm";
    case "router_offline":
      return "Router Offline Alarm";
    case "technical":
      return "Technical Alarm";
    case "other_disturbance":
      return "Other Disturbance Alarm";
  }
}

const alarmTypeAliases: Record<string, AlarmType> = {
  motion: "motion",
  bewegung: "motion",
  intrusion: "motion",
  line_crossing: "line_crossing",
  "line-crossing": "line_crossing",
  "line crossing": "line_crossing",
  laser_tripwire: "line_crossing",
  tripwire: "line_crossing",
  area_entry: "area_entry",
  "area-entry": "area_entry",
  "area entry": "area_entry",
  sabotage: "sabotage",
  tamper: "sabotage",
  video_loss: "video_loss",
  "video-loss": "video_loss",
  "video loss": "video_loss",
  camera_offline: "camera_offline",
  "camera-offline": "camera_offline",
  "camera offline": "camera_offline",
  nvr_offline: "nvr_offline",
  "nvr-offline": "nvr_offline",
  "nvr offline": "nvr_offline",
  router_offline: "router_offline",
  "router-offline": "router_offline",
  "router offline": "router_offline",
  technical: "technical",
  offline: "technical",
  other_disturbance: "other_disturbance",
  "other-disturbance": "other_disturbance",
  "other disturbance": "other_disturbance",
  manual: "other_disturbance",
  audio_detection: "other_disturbance",
  "audio-detection": "other_disturbance",
  "audio detection": "other_disturbance",
  unknown: "other_disturbance"
};

function isRecognizedAlarmType(rawType: string): boolean {
  const normalized = rawType.trim().toLowerCase();
  return (alarmTypes as readonly string[]).includes(normalized) || normalized in alarmTypeAliases;
}

function mergeTechnicalDetails(
  technicalDetails: Record<string, unknown> | undefined,
  technicalReasons: string[],
  payload: AlarmIngestionRequest
): Record<string, unknown> | undefined {
  if (!technicalDetails && technicalReasons.length === 0) {
    return undefined;
  }

  return {
    ...(technicalDetails ?? {}),
    ingestionTechnicalReasons: technicalReasons,
    rawAlarmType: payload.alarmType,
    rawPriority: payload.priority,
    rawPrimaryDeviceId: payload.primaryDeviceId
  };
}

function buildMediaEvent(alarmCaseId: string, media: AlarmMediaRecord): AlarmEventCreateInput {
  return {
    alarmCaseId,
    eventKind: "media_attached",
    message: "Media reference attached during ingestion.",
    payload: {
      mediaId: media.id,
      mediaKind: media.mediaKind,
      storageKey: media.storageKey,
      isPrimary: media.isPrimary
    }
  };
}