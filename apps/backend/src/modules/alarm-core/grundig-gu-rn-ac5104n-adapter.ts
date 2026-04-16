/**
 * Uebersetzt Grundig-GU-RN-AC5104N-Recorder-Ereignisse in das externe Alarm-Ingestion-Format.
 */
import type {
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult,
  GrundigGuRnAc5104nAlarmIngestionRequest
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";
import { normalizeVendorEventType } from "./vendor-profiles.js";

export type GrundigGuRnAc5104nAlarmAdapterService = {
  ingest: (input: GrundigGuRnAc5104nAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateGrundigGuRnAc5104nAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createGrundigGuRnAc5104nAlarmAdapter(
  input: CreateGrundigGuRnAc5104nAlarmAdapterInput
): GrundigGuRnAc5104nAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeGrundigGuRnAc5104nAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeGrundigGuRnAc5104nAlarm(
  payload: GrundigGuRnAc5104nAlarmIngestionRequest
): ExternalAlarmIngestionRequest {
  const primarySerialNumber = payload.cameraSerialNumber?.trim() || payload.recorderSerialNumber?.trim();
  const primaryNetworkAddress = payload.cameraIp?.trim() || payload.recorderIp?.trim();
  const eventType = mapGrundigEventCode(payload.eventCode);
  const severity = mapGrundigSeverity(payload.severity);
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
    sourceType: "nvr",
    externalEventId: payload.sourceEventId.trim(),
    eventType,
    eventTime: payload.eventTime,
    ...(payload.siteId?.trim() ? { siteId: payload.siteId.trim() } : {}),
    ...(primarySerialNumber ? { deviceSerialNumber: primarySerialNumber } : {}),
    ...(primaryNetworkAddress ? { deviceNetworkAddress: primaryNetworkAddress } : {}),
    ...(payload.cameraId?.trim() ? { externalDeviceId: payload.cameraId.trim(), sourceName: payload.cameraId.trim() } : {}),
    ...(payload.recorderId?.trim() ? { externalRecorderId: payload.recorderId.trim() } : {}),
    ...(payload.channel !== undefined ? { channelNumber: payload.channel } : {}),
    ...(severity ? { severity } : {}),
    title,
    ...(description ? { description } : {}),
    ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
    ...(payload.cameraName?.trim() ? { cameraName: payload.cameraName.trim() } : {}),
    ...(media.length > 0 ? { media } : {}),
    rawPayload: buildRawPayload(payload, eventType)
  };
}

function mapGrundigEventCode(eventCode: string): string {
  const normalized = normalizeVendorEventType("grundig", "nvr", eventCode);
  const mapped = grundigEventCodeMap[normalized];
  if (mapped) {
    return mapped;
  }
  return toVendorSnakeCase(normalized);
}

function mapGrundigSeverity(rawSeverity: string | undefined): string | undefined {
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

function buildTitle(payload: GrundigGuRnAc5104nAlarmIngestionRequest, eventType: string): string {
  const location = payload.cameraName?.trim() || payload.ruleName?.trim() || payload.eventCode.trim();
  const eventLabel = eventType === payload.eventCode ? payload.eventCode.trim() : formatVendorEventLabel(eventType);
  return `Grundig ${location} | ${eventLabel}`;
}

function buildDescription(payload: GrundigGuRnAc5104nAlarmIngestionRequest): string | undefined {
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

function buildRawPayload(payload: GrundigGuRnAc5104nAlarmIngestionRequest, eventType: string): Record<string, unknown> {
  return {
    adapter: "grundig-gu-rn-ac5104n",
    sourceEventId: payload.sourceEventId.trim(),
    eventCode: payload.eventCode.trim(),
    normalizedEventType: eventType,
    ...(payload.eventAction?.trim() ? { eventAction: payload.eventAction.trim() } : {}),
    ...(payload.channel !== undefined ? { channel: payload.channel } : {}),
    ...(payload.recorderId?.trim() ? { recorderId: payload.recorderId.trim() } : {}),
    ...(payload.recorderSerialNumber?.trim() ? { recorderSerialNumber: payload.recorderSerialNumber.trim() } : {}),
    ...(payload.recorderIp?.trim() ? { recorderIp: payload.recorderIp.trim() } : {}),
    ...(payload.cameraId?.trim() ? { cameraId: payload.cameraId.trim() } : {}),
    ...(payload.cameraSerialNumber?.trim() ? { cameraSerialNumber: payload.cameraSerialNumber.trim() } : {}),
    ...(payload.cameraIp?.trim() ? { cameraIp: payload.cameraIp.trim() } : {}),
    ...(payload.ruleName?.trim() ? { ruleName: payload.ruleName.trim() } : {}),
    ...(payload.rawPayload ? { vendorPayload: payload.rawPayload } : {})
  };
}

const grundigEventCodeMap: Record<string, string> = {
  motion: "motion",
  motiondetect: "motion",
  pid: "area_entry",
  perimeterintrusiondetection: "area_entry",
  intrusiondetection: "area_entry",
  lcd: "line_crossing",
  linecrossingdetection: "line_crossing",
  videoloss: "video_loss",
  videotampering: "sabotage",
  videotamperingdetection: "sabotage",
  tamper: "sabotage",
  pirdetection: "motion",
  humanvehicledetection: "motion"
};