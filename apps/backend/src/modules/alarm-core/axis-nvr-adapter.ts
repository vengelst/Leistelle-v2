/**
 * Uebersetzt Axis-NVR-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  AxisNvrAlarmIngestionRequest,
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";

export type AxisNvrAlarmAdapterService = {
  ingest: (input: AxisNvrAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateAxisNvrAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createAxisNvrAlarmAdapter(
  input: CreateAxisNvrAlarmAdapterInput
): AxisNvrAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeAxisNvrAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeAxisNvrAlarm(payload: AxisNvrAlarmIngestionRequest): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim() || payload.nvrSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim() || payload.nvrIp?.trim();
  const eventType = mapAxisNvrEvent(payload.eventCode, payload.eventType);
  const severity = mapAxisNvrSeverity(payload.severity);
  const title = buildTitle(payload, eventType);
  const description = buildDescription(payload);
  const media = (payload.media ?? []).map((entry) => ({
    storageKey: entry.url,
    mediaKind: entry.mediaType,
    ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
    ...(entry.cameraSerialNumber?.trim() ? { deviceSerialNumber: entry.cameraSerialNumber.trim() } : {}),
    ...(entry.cameraIp?.trim() ? { deviceNetworkAddress: entry.cameraIp.trim() } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {})
  }));

  return {
    sourceSystem: "axis",
    sourceType: "nvr",
    externalEventId: payload.sourceEventId.trim(),
    eventType,
    eventTime: payload.eventTime,
    ...(payload.siteId?.trim() ? { siteId: payload.siteId.trim() } : {}),
    ...(primarySerialNumber ? { deviceSerialNumber: primarySerialNumber } : {}),
    ...(primaryNetworkAddress ? { deviceNetworkAddress: primaryNetworkAddress } : {}),
    ...(severity ? { severity } : {}),
    title,
    ...(description ? { description } : {}),
    ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
    ...(payload.cameraName?.trim() ? { cameraName: payload.cameraName.trim() } : {}),
    ...(media.length > 0 ? { media } : {}),
    rawPayload: buildRawPayload(payload, eventType)
  };
}

function mapAxisNvrEvent(eventCode: string, eventType?: string): string {
  const candidates = [eventCode, eventType]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = axisNvrEventCodeMap[candidate];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(eventType?.trim() || eventCode.trim());
}

function mapAxisNvrSeverity(rawSeverity: string | undefined): string | undefined {
  if (!rawSeverity?.trim()) {
    return undefined;
  }
  const normalized = rawSeverity.trim().toLowerCase();
  switch (normalized) {
    case "1":
    case "critical":
    case "urgent":
    case "major":
      return "critical";
    case "2":
    case "high":
    case "warning":
      return "high";
    case "3":
    case "normal":
    case "medium":
    case "low":
    case "info":
      return "normal";
    default:
      return normalized;
  }
}

function buildTitle(payload: AxisNvrAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.ruleName?.trim()
    || payload.nvrName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  return `Axis NVR ${location} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: AxisNvrAlarmIngestionRequest): string | undefined {
  if (payload.description?.trim()) {
    return payload.description.trim();
  }

  const parts = [
    payload.nvrName?.trim() ? `Recorder ${payload.nvrName.trim()}` : "",
    payload.ruleName?.trim() ? `Regel ${payload.ruleName.trim()}` : "",
    payload.zone?.trim() ? `Zone ${payload.zone.trim()}` : "",
    payload.channel !== undefined ? `Kanal ${payload.channel}` : "",
    payload.siteExternalHint?.trim() ? `Standort-Hinweis ${payload.siteExternalHint.trim()}` : ""
  ].filter((entry) => entry.length > 0);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildRawPayload(payload: AxisNvrAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "axis-nvr",
    sourceEventId: payload.sourceEventId.trim(),
    eventCode: payload.eventCode.trim(),
    ...(payload.eventType?.trim() ? { eventType: payload.eventType.trim() } : {}),
    normalizedEventType: eventType,
    ...(payload.nvrId?.trim() ? { nvrId: payload.nvrId.trim() } : {}),
    ...(payload.nvrName?.trim() ? { nvrName: payload.nvrName.trim() } : {}),
    ...(payload.nvrSerialNumber?.trim() ? { nvrSerialNumber: payload.nvrSerialNumber.trim() } : {}),
    ...(payload.nvrIp?.trim() ? { nvrIp: payload.nvrIp.trim() } : {}),
    ...(payload.cameraId?.trim() ? { cameraId: payload.cameraId.trim() } : {}),
    ...(payload.cameraSerialNumber?.trim() ? { cameraSerialNumber: payload.cameraSerialNumber.trim() } : {}),
    ...(payload.cameraIp?.trim() ? { cameraIp: payload.cameraIp.trim() } : {}),
    ...(payload.channel !== undefined ? { channel: payload.channel } : {}),
    ...(payload.ruleName?.trim() ? { ruleName: payload.ruleName.trim() } : {}),
    ...(payload.siteExternalHint?.trim() ? { siteExternalHint: payload.siteExternalHint.trim() } : {}),
    ...(payload.rawPayload ? { vendorPayload: payload.rawPayload } : {})
  };
}

const axisNvrEventCodeMap: Record<string, string> = {
  universalmotiondetection: "motion",
  forwardedmotion: "motion",
  motion: "motion",
  videomotion: "motion",
  videoloss: "video_loss",
  videoconnectionlost: "video_loss",
  video_loss: "video_loss",
  storageerror: "technical",
  diskerror: "technical",
  diskfull: "technical",
  recordingfailed: "technical",
  recorderror: "technical",
  networklost: "nvr_offline",
  recorderoffline: "nvr_offline",
  nvroffline: "nvr_offline",
  connectionlost: "nvr_offline",
  remotedeviceconnectionlost: "camera_offline",
  cameradisconnected: "camera_offline",
  channeloffline: "camera_offline",
  tamper: "sabotage",
  tampering: "sabotage"
};