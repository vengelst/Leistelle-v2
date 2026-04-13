import type {
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  UniviewIpCameraAlarmIngestionRequest
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";

export type UniviewIpCameraAlarmAdapterService = {
  ingest: (input: UniviewIpCameraAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateUniviewIpCameraAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createUniviewIpCameraAlarmAdapter(
  input: CreateUniviewIpCameraAlarmAdapterInput
): UniviewIpCameraAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeUniviewIpCameraAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeUniviewIpCameraAlarm(
  payload: UniviewIpCameraAlarmIngestionRequest
): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim();
  const eventType = mapUniviewCameraEvent(payload.eventCode, payload.eventType, payload.analyticsName);
  const severity = mapUniviewCameraSeverity(payload.severity);
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
    sourceSystem: "uniview",
    sourceType: "camera",
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

function mapUniviewCameraEvent(eventCode: string, eventType?: string, analyticsName?: string): string {
  const candidates = [eventCode, eventType, analyticsName]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = univiewCameraEventCodeMap[candidate];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(analyticsName?.trim() || eventType?.trim() || eventCode.trim());
}

function mapUniviewCameraSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: UniviewIpCameraAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.analyticsName?.trim()
    || payload.ruleName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  return `Uniview Camera ${location} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: UniviewIpCameraAlarmIngestionRequest): string | undefined {
  if (payload.description?.trim()) {
    return payload.description.trim();
  }

  const parts = [
    payload.analyticsName?.trim() ? `Analytics ${payload.analyticsName.trim()}` : "",
    payload.ruleName?.trim() ? `Regel ${payload.ruleName.trim()}` : "",
    payload.zone?.trim() ? `Zone ${payload.zone.trim()}` : "",
    payload.siteExternalHint?.trim() ? `Standort-Hinweis ${payload.siteExternalHint.trim()}` : ""
  ].filter((entry) => entry.length > 0);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildRawPayload(
  payload: UniviewIpCameraAlarmIngestionRequest,
  eventType: string
): Record<string, unknown> {
  return {
    adapter: "uniview-ip-camera",
    sourceEventId: payload.sourceEventId.trim(),
    eventCode: payload.eventCode.trim(),
    ...(payload.eventType?.trim() ? { eventType: payload.eventType.trim() } : {}),
    normalizedEventType: eventType,
    ...(payload.cameraId?.trim() ? { cameraId: payload.cameraId.trim() } : {}),
    ...(payload.cameraSerialNumber?.trim() ? { cameraSerialNumber: payload.cameraSerialNumber.trim() } : {}),
    ...(payload.cameraIp?.trim() ? { cameraIp: payload.cameraIp.trim() } : {}),
    ...(payload.ruleName?.trim() ? { ruleName: payload.ruleName.trim() } : {}),
    ...(payload.analyticsName?.trim() ? { analyticsName: payload.analyticsName.trim() } : {}),
    ...(payload.siteExternalHint?.trim() ? { siteExternalHint: payload.siteExternalHint.trim() } : {}),
    ...(payload.rawPayload ? { vendorPayload: payload.rawPayload } : {})
  };
}

const univiewCameraEventCodeMap: Record<string, string> = {
  motion: "motion",
  videomotion: "motion",
  motiondetection: "motion",
  linecrossing: "line_crossing",
  line_crossing: "line_crossing",
  crosslinedetection: "line_crossing",
  crossline: "line_crossing",
  intrusion: "area_entry",
  intrusiondetection: "area_entry",
  enterarea: "area_entry",
  areaentry: "area_entry",
  regionalintrusion: "area_entry",
  tamper: "sabotage",
  tampering: "sabotage",
  coveralarm: "sabotage",
  obstruction: "sabotage",
  covering: "sabotage",
  shelteralarm: "sabotage",
  videoloss: "video_loss",
  video_loss: "video_loss",
  networkdisconnected: "camera_offline",
  deviceoffline: "camera_offline",
  deviceunreachable: "camera_offline",
  networkabnormal: "camera_offline",
  ipconflict: "camera_offline",
  connectionlost: "camera_offline"
};
