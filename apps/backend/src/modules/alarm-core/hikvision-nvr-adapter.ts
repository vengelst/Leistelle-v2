/**
 * Uebersetzt Hikvision-NVR-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  HikvisionNvrAlarmIngestionRequest
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";
import { normalizeVendorEventType } from "./vendor-profiles.js";

export type HikvisionNvrAlarmAdapterService = {
  ingest: (input: HikvisionNvrAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateHikvisionNvrAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createHikvisionNvrAlarmAdapter(
  input: CreateHikvisionNvrAlarmAdapterInput
): HikvisionNvrAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeHikvisionNvrAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeHikvisionNvrAlarm(payload: HikvisionNvrAlarmIngestionRequest): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim() || payload.nvrSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim() || payload.nvrIp?.trim();
  const eventType = mapHikvisionNvrEvent(payload.eventCode, payload.eventType);
  const severity = mapHikvisionNvrSeverity(payload.severity);
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

function mapHikvisionNvrEvent(eventCode: string, eventType?: string): string {
  const candidates = [eventCode, eventType]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = hikvisionNvrEventCodeMap[normalizeVendorEventType("hikvision", "nvr", candidate)];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(normalizeVendorEventType("hikvision", "nvr", eventType?.trim() || eventCode.trim()));
}

function mapHikvisionNvrSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: HikvisionNvrAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim()
    || payload.ruleName?.trim()
    || payload.nvrName?.trim()
    || payload.eventType?.trim()
    || payload.eventCode.trim();
  return `Hikvision NVR ${location} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: HikvisionNvrAlarmIngestionRequest): string | undefined {
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

function buildRawPayload(payload: HikvisionNvrAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "hikvision-nvr",
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

const hikvisionNvrEventCodeMap: Record<string, string> = {
  videomotion: "motion",
  motion: "motion",
  motiondetection: "motion",
  videoloss: "video_loss",
  videolost: "video_loss",
  tamper: "sabotage",
  shelteralarm: "sabotage",
  hderror: "technical",
  diskerror: "technical",
  hdfull: "technical",
  diskfull: "technical",
  recorderror: "technical",
  netbroken: "nvr_offline",
  nvroffline: "nvr_offline",
  ipconflict: "nvr_offline",
  ipaddressconflicted: "nvr_offline",
  ipcdisconnect: "camera_offline",
  channeloffline: "camera_offline",
  videoexception: "technical"
};