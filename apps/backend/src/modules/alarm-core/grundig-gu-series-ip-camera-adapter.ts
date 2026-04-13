import type {
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  GrundigGuSeriesIpCameraAlarmIngestionRequest
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";
import { normalizeVendorEventType } from "./vendor-profiles.js";

export type GrundigGuSeriesIpCameraAlarmAdapterService = {
  ingest: (input: GrundigGuSeriesIpCameraAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateGrundigGuSeriesIpCameraAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createGrundigGuSeriesIpCameraAlarmAdapter(
  input: CreateGrundigGuSeriesIpCameraAlarmAdapterInput
): GrundigGuSeriesIpCameraAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeGrundigGuSeriesIpCameraAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeGrundigGuSeriesIpCameraAlarm(
  payload: GrundigGuSeriesIpCameraAlarmIngestionRequest
): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim();
  const eventType = mapGrundigGuCameraEvent(payload.eventCode, payload.eventType, payload.analyticsName);
  const severity = mapGrundigGuCameraSeverity(payload.severity);
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
    sourceSystem: "grundig",
    sourceType: "camera",
    externalEventId: payload.sourceEventId.trim(),
    eventType,
    eventTime: payload.eventTime,
    ...(payload.siteId?.trim() ? { siteId: payload.siteId.trim() } : {}),
    ...(primarySerialNumber ? { deviceSerialNumber: primarySerialNumber } : {}),
    ...(primaryNetworkAddress ? { deviceNetworkAddress: primaryNetworkAddress } : {}),
    ...(payload.cameraId?.trim() ? { externalDeviceId: payload.cameraId.trim(), sourceName: payload.cameraId.trim() } : {}),
    ...(severity ? { severity } : {}),
    title,
    ...(description ? { description } : {}),
    ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
    ...(payload.cameraName?.trim() ? { cameraName: payload.cameraName.trim() } : {}),
    ...(media.length > 0 ? { media } : {}),
    rawPayload: buildRawPayload(payload, eventType)
  };
}

function mapGrundigGuCameraEvent(eventCode: string, eventType?: string, analyticsName?: string): string {
  const candidates = [eventCode, eventType, analyticsName]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = grundigGuCameraEventCodeMap[normalizeVendorEventType("grundig", "camera", candidate)];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(normalizeVendorEventType("grundig", "camera", analyticsName?.trim() || eventType?.trim() || eventCode.trim()));
}

function mapGrundigGuCameraSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: GrundigGuSeriesIpCameraAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.analyticsName?.trim()
    || payload.ruleName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  return `Grundig Camera ${location} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: GrundigGuSeriesIpCameraAlarmIngestionRequest): string | undefined {
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
  payload: GrundigGuSeriesIpCameraAlarmIngestionRequest,
  eventType: string
): Record<string, unknown> {
  return {
    adapter: "grundig-gu-series-ip-camera",
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

const grundigGuCameraEventCodeMap: Record<string, string> = {
  motion: "motion",
  motiondetect: "motion",
  motion_detection: "motion",
  linecrossing: "line_crossing",
  linecrossingdetection: "line_crossing",
  line_crossing: "line_crossing",
  tripwire: "line_crossing",
  intrusion: "area_entry",
  intrusiondetection: "area_entry",
  intrusion_detection: "area_entry",
  perimeterintrusiondetection: "area_entry",
  videotampering: "sabotage",
  videotamperingdetection: "sabotage",
  tamper: "sabotage",
  videoloss: "video_loss",
  video_loss: "video_loss",
  networkdisconnected: "camera_offline",
  network_disconnected: "camera_offline",
  ipaddressconflicted: "camera_offline",
  ip_address_conflicted: "camera_offline"
};
