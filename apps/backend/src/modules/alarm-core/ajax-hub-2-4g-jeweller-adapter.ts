import type {
  AjaxHub2FourGJewellerAlarmIngestionRequest,
  ExternalAlarmIngestionRequest,
  ExternalAlarmIngestionResult
} from "@leitstelle/contracts";

import type { ExternalAlarmIngestionService } from "./external-ingestion-service.js";
import { formatVendorEventLabel, toVendorSnakeCase } from "./vendor-adapter-utils.js";

export type AjaxHub2FourGJewellerAlarmAdapterService = {
  ingest: (input: AjaxHub2FourGJewellerAlarmIngestionRequest, requestId: string, providedSharedSecret?: string) => Promise<ExternalAlarmIngestionResult>;
};

type CreateAjaxHub2FourGJewellerAlarmAdapterInput = {
  externalAlarmIngestion: Pick<ExternalAlarmIngestionService, "ingest">;
};

export function createAjaxHub2FourGJewellerAlarmAdapter(
  input: CreateAjaxHub2FourGJewellerAlarmAdapterInput
): AjaxHub2FourGJewellerAlarmAdapterService {
  return {
    async ingest(payload, requestId, providedSharedSecret) {
      const normalized = normalizeAjaxHub2FourGJewellerAlarm(payload);
      return await input.externalAlarmIngestion.ingest(normalized, requestId, providedSharedSecret);
    }
  };
}

export function normalizeAjaxHub2FourGJewellerAlarm(
  payload: AjaxHub2FourGJewellerAlarmIngestionRequest
): ExternalAlarmIngestionRequest {
  const normalizedEventType = mapAjaxEventType(payload.eventType, payload.eventSubType, payload.eventCode);
  const normalizedSeverity = mapAjaxSeverity(payload.severity, normalizedEventType);
  const title = buildTitle(payload, normalizedEventType);
  const description = buildDescription(payload);
  const media = (payload.media ?? []).map((entry) => ({
    storageKey: entry.url,
    mediaKind: entry.mediaType === "snapshot" ? "snapshot" : "document",
    ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {})
  }));

  return {
    sourceSystem: "ajax",
    sourceType: "hub",
    externalEventId: payload.sourceEventId.trim(),
    eventType: normalizedEventType,
    eventTime: payload.eventTime,
    ...(payload.siteId?.trim() ? { siteId: payload.siteId.trim() } : {}),
    ...(payload.deviceId?.trim() ? { deviceId: payload.deviceId.trim() } : {}),
    ...(normalizedSeverity ? { severity: normalizedSeverity } : {}),
    title,
    ...(description ? { description } : {}),
    ...(payload.zone?.trim() ? { zone: payload.zone.trim() } : {}),
    ...(payload.deviceName?.trim() ? { cameraName: payload.deviceName.trim() } : {}),
    ...(media.length > 0 ? { media } : {}),
    rawPayload: buildRawPayload(payload, normalizedEventType)
  };
}

function mapAjaxEventType(eventType: string, eventSubType?: string, eventCode?: string): string {
  const candidates = [eventType, eventSubType, eventCode]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value && value.length > 0));

  for (const candidate of candidates) {
    const mapped = ajaxEventTypeMap[candidate];
    if (mapped) {
      return mapped;
    }
  }

  return toVendorSnakeCase(eventSubType?.trim() || eventCode?.trim() || eventType.trim());
}

function mapAjaxSeverity(rawSeverity: string | undefined, eventType: string): string | undefined {
  if (rawSeverity?.trim()) {
    const normalized = rawSeverity.trim().toLowerCase();
    switch (normalized) {
      case "critical":
      case "major":
      case "high":
        return "critical";
      case "warning":
      case "medium":
        return "high";
      case "normal":
      case "low":
      case "info":
        return "normal";
      default:
        return normalized;
    }
  }

  switch (eventType) {
    case "sabotage":
      return "critical";
    case "motion":
    case "area_entry":
      return "high";
    case "technical":
    case "other_disturbance":
      return "normal";
    default:
      return undefined;
  }
}

function buildTitle(payload: AjaxHub2FourGJewellerAlarmIngestionRequest, eventType: string): string {
  const subject = payload.deviceName?.trim()
    || payload.hubName?.trim()
    || payload.eventSubType?.trim()
    || payload.eventType.trim();
  return `Ajax ${subject} | ${formatVendorEventLabel(eventType)}`;
}

function buildDescription(payload: AjaxHub2FourGJewellerAlarmIngestionRequest): string | undefined {
  if (payload.description?.trim()) {
    return payload.description.trim();
  }

  const parts = [
    payload.hubName?.trim() ? `Hub ${payload.hubName.trim()}` : "",
    payload.room?.trim() ? `Raum ${payload.room.trim()}` : "",
    payload.group?.trim() ? `Gruppe ${payload.group.trim()}` : "",
    payload.partition?.trim() ? `Partition ${payload.partition.trim()}` : "",
    payload.user?.trim() ? `Benutzer ${payload.user.trim()}` : "",
    payload.triggerSource?.trim() ? `Ausloeser ${payload.triggerSource.trim()}` : ""
  ].filter((entry) => entry.length > 0);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildRawPayload(
  payload: AjaxHub2FourGJewellerAlarmIngestionRequest,
  normalizedEventType: string
): Record<string, unknown> {
  return {
    adapter: "ajax-hub-2-4g-jeweller",
    sourceEventId: payload.sourceEventId.trim(),
    eventType: payload.eventType.trim(),
    ...(payload.eventCode?.trim() ? { eventCode: payload.eventCode.trim() } : {}),
    ...(payload.eventSubType?.trim() ? { eventSubType: payload.eventSubType.trim() } : {}),
    normalizedEventType,
    ...(payload.hubId?.trim() ? { hubId: payload.hubId.trim() } : {}),
    ...(payload.hubName?.trim() ? { hubName: payload.hubName.trim() } : {}),
    ...(payload.hubExternalId?.trim() ? { hubExternalId: payload.hubExternalId.trim() } : {}),
    ...(payload.detectorId?.trim() ? { detectorId: payload.detectorId.trim() } : {}),
    ...(payload.deviceName?.trim() ? { deviceName: payload.deviceName.trim() } : {}),
    ...(payload.room?.trim() ? { room: payload.room.trim() } : {}),
    ...(payload.group?.trim() ? { group: payload.group.trim() } : {}),
    ...(payload.partition?.trim() ? { partition: payload.partition.trim() } : {}),
    ...(payload.user?.trim() ? { user: payload.user.trim() } : {}),
    ...(payload.triggerSource?.trim() ? { triggerSource: payload.triggerSource.trim() } : {}),
    ...(payload.rawPayload ? { vendorPayload: payload.rawPayload } : {})
  };
}

const ajaxEventTypeMap: Record<string, string> = {
  intrusion: "motion",
  intrusion_alarm: "motion",
  burglary_alarm: "motion",
  motion_alarm: "motion",
  alarm: "motion",
  opening: "area_entry",
  opening_alarm: "area_entry",
  glass_break: "area_entry",
  panic: "other_disturbance",
  panic_alarm: "other_disturbance",
  hold_up: "other_disturbance",
  medical: "other_disturbance",
  medical_alarm: "other_disturbance",
  fire: "other_disturbance",
  fire_alarm: "other_disturbance",
  leak: "other_disturbance",
  water_leak: "other_disturbance",
  tamper: "sabotage",
  tamper_alarm: "sabotage",
  device_tamper: "sabotage",
  lid_open: "sabotage",
  malfunction: "technical",
  device_malfunction: "technical",
  connection_lost: "technical",
  hub_offline: "technical",
  detector_offline: "technical",
  low_battery: "technical"
};
