/**
 * Uebersetzt AJAX NVR 8CH-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  AjaxNvr8chAlarmIngestionRequest,
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";

export type AjaxNvr8chAlarmAdapterService = {
  ingest: (input: AjaxNvr8chAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateAjaxNvr8chAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createAjaxNvr8chAlarmAdapter(
  input: CreateAjaxNvr8chAlarmAdapterInput
): AjaxNvr8chAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeAjaxNvr8chAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeAjaxNvr8chAlarm(payload: AjaxNvr8chAlarmIngestionRequest): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim() || payload.nvrSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim() || payload.nvrIp?.trim();
  const eventType = mapAjaxNvrEvent(payload.eventCode, payload.eventType);
  const severity = mapAjaxNvrSeverity(payload.severity);
  const title = buildTitle(payload, eventType);
  const description = buildDescription(payload);
  const media = (payload.media ?? []).map((entry) => ({
    storageKey: entry.url,
    mediaKind: mapAjaxNvrMediaType(entry.mediaType),
    ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
    ...(entry.cameraSerialNumber?.trim() ? { deviceSerialNumber: entry.cameraSerialNumber.trim() } : {}),
    ...(entry.cameraIp?.trim() ? { deviceNetworkAddress: entry.cameraIp.trim() } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {})
  }));

  return {
    sourceSystem: "ajax",
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

function mapAjaxNvrEvent(eventCode: string, eventType?: string): string {
  const candidates = [eventCode, eventType]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = ajaxNvrEventCodeMap[candidate];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(eventType?.trim() || eventCode.trim());
}

function mapAjaxNvrSeverity(rawSeverity: string | undefined): string | undefined {
  if (!rawSeverity?.trim()) {
    return undefined;
  }
  const normalized = rawSeverity.trim().toLowerCase();
  switch (normalized) {
    case "critical":
    case "major":
    case "high":
    case "1":
      return "critical";
    case "warning":
    case "medium":
    case "2":
      return "high";
    case "normal":
    case "low":
    case "info":
    case "3":
      return "normal";
    default:
      return normalized;
  }
}

function mapAjaxNvrMediaType(mediaType: "snapshot" | "clip" | "archive_reference"): string {
  switch (mediaType) {
    case "snapshot":
      return "snapshot";
    case "clip":
      return "clip";
    case "archive_reference":
      return "document";
  }
}

function buildTitle(payload: AjaxNvr8chAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.ruleName?.trim()
    || payload.nvrName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  const eventLabel = formatVendorEventLabel(eventType);
  return `Ajax NVR ${location} | ${eventLabel}`;
}

function buildDescription(payload: AjaxNvr8chAlarmIngestionRequest): string | undefined {
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

function buildRawPayload(payload: AjaxNvr8chAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "ajax-nvr-8ch",
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

const ajaxNvrEventCodeMap: Record<string, string> = {
  motion: "motion",
  motion_detected: "motion",
  video_motion: "motion",
  motion_alarm: "motion",
  intrusion: "area_entry",
  intrusion_alarm: "area_entry",
  perimeter_intrusion: "area_entry",
  zone_enter: "area_entry",
  line_crossing: "line_crossing",
  tripwire: "line_crossing",
  tamper: "sabotage",
  enclosure_open: "sabotage",
  cover_open: "sabotage",
  video_loss: "video_loss",
  stream_lost: "video_loss",
  no_video_signal: "video_loss",
  camera_offline: "camera_offline",
  channel_offline: "camera_offline",
  nvr_offline: "nvr_offline",
  recorder_offline: "nvr_offline"
};