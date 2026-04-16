/**
 * Uebersetzt Hikvision-IP-Kamera-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  HikvisionIpCameraAlarmIngestionRequest
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";
import { normalizeVendorEventType } from "./vendor-profiles.js";

export type HikvisionIpCameraAlarmAdapterService = {
  ingest: (input: HikvisionIpCameraAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateHikvisionIpCameraAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createHikvisionIpCameraAlarmAdapter(
  input: CreateHikvisionIpCameraAlarmAdapterInput
): HikvisionIpCameraAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeHikvisionIpCameraAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeHikvisionIpCameraAlarm(
  payload: HikvisionIpCameraAlarmIngestionRequest
): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim();
  const eventType = mapHikvisionCameraEvent(payload.eventCode, payload.eventType, payload.analyticsName);
  const severity = mapHikvisionCameraSeverity(payload.severity);
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
    sourceSystem: "hikvision",
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

function mapHikvisionCameraEvent(eventCode: string, eventType?: string, analyticsName?: string): string {
  const candidates = [eventCode, eventType, analyticsName]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = hikvisionCameraEventCodeMap[normalizeVendorEventType("hikvision", "camera", candidate)];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(normalizeVendorEventType("hikvision", "camera", analyticsName?.trim() || eventType?.trim() || eventCode.trim()));
}

function mapHikvisionCameraSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: HikvisionIpCameraAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.analyticsName?.trim()
    || payload.ruleName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  return `Hikvision Camera ${location} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: HikvisionIpCameraAlarmIngestionRequest): string | undefined {
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

function buildRawPayload(payload: HikvisionIpCameraAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "hikvision-ip-camera",
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

const hikvisionCameraEventCodeMap: Record<string, string> = {
  videomotion: "motion",
  motion: "motion",
  motiondetection: "motion",
  motion_detection: "motion",
  linedetection: "line_crossing",
  linedetectionstart: "line_crossing",
  linedetectionstop: "line_crossing",
  line_detection: "line_crossing",
  line_detection_start: "line_crossing",
  intrusion: "area_entry",
  intrusionstart: "area_entry",
  intrusionstop: "area_entry",
  fielddetection: "area_entry",
  tamperdetection: "sabotage",
  shelteralarm: "sabotage",
  videoloss: "video_loss",
  video_loss: "video_loss",
  netbroken: "camera_offline",
  networkdisconnected: "camera_offline",
  ipconflict: "camera_offline",
  ipaddressconflicted: "camera_offline",
  ipcdisconnect: "camera_offline"
};