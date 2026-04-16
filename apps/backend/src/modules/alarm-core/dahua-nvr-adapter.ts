/**
 * Uebersetzt Dahua-NVR-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  DahuaNvrAlarmIngestionRequest,
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";
import { normalizeVendorEventType } from "./vendor-profiles.js";

export type DahuaNvrAlarmAdapterService = {
  ingest: (input: DahuaNvrAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateDahuaNvrAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createDahuaNvrAlarmAdapter(
  input: CreateDahuaNvrAlarmAdapterInput
): DahuaNvrAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeDahuaNvrAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeDahuaNvrAlarm(payload: DahuaNvrAlarmIngestionRequest): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim() || payload.recorderSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim() || payload.recorderIp?.trim();
  const eventType = mapDahuaEventCode(payload.eventCode);
  const severity = mapDahuaSeverity(payload.severity);
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
    sourceSystem: "dahua",
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

function mapDahuaEventCode(eventCode: string): string {
  const normalized = normalizeVendorEventType("dahua", "nvr", eventCode);
  const mapped = dahuaEventCodeMap[normalized];
  if (mapped) {
    return mapped;
  }
  return toVendorSnakeCase(normalized);
}

function mapDahuaSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: DahuaNvrAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim() || payload.ruleName?.trim() || payload.eventCode.trim();
  const eventLabel = eventType === payload.eventCode ? payload.eventCode.trim() : formatVendorEventLabel(eventType);
  return `Dahua ${location} | ${eventLabel}`;
}

function buildDescription(payload: DahuaNvrAlarmIngestionRequest): string | undefined {
  if (payload.description?.trim()) {
    return payload.description.trim();
  }

  const parts = [
    payload.ruleName?.trim() ? `Regel ${payload.ruleName.trim()}` : "",
    payload.zone?.trim() ? `Zone ${payload.zone.trim()}` : "",
    payload.channel !== undefined ? `Kanal ${payload.channel}` : "",
    payload.eventAction?.trim() ? `Aktion ${payload.eventAction.trim()}` : ""
  ].filter((entry) => entry.length > 0);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildRawPayload(payload: DahuaNvrAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "dahua-nvr",
    sourceEventId: payload.sourceEventId.trim(),
    eventCode: payload.eventCode.trim(),
    normalizedEventType: eventType,
    ...(payload.eventAction?.trim() ? { eventAction: payload.eventAction.trim() } : {}),
    ...(payload.channel !== undefined ? { channel: payload.channel } : {}),
    ...(payload.recorderSerialNumber?.trim() ? { recorderSerialNumber: payload.recorderSerialNumber.trim() } : {}),
    ...(payload.recorderIp?.trim() ? { recorderIp: payload.recorderIp.trim() } : {}),
    ...(payload.cameraSerialNumber?.trim() ? { cameraSerialNumber: payload.cameraSerialNumber.trim() } : {}),
    ...(payload.cameraIp?.trim() ? { cameraIp: payload.cameraIp.trim() } : {}),
    ...(payload.ruleName?.trim() ? { ruleName: payload.ruleName.trim() } : {}),
    ...(payload.rawPayload ? { vendorPayload: payload.rawPayload } : {})
  };
}

const dahuaEventCodeMap: Record<string, string> = {
  videomotion: "motion",
  motiondetect: "motion",
  crosslinedetection: "line_crossing",
  tripwire: "line_crossing",
  crossregiondetection: "area_entry",
  intrusion: "area_entry",
  videoblind: "sabotage",
  tamper: "sabotage",
  videoloss: "video_loss",
  ipcoffline: "camera_offline",
  nvroffline: "nvr_offline",
  recorderoffline: "nvr_offline"
};