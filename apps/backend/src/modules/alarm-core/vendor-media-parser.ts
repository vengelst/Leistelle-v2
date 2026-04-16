/**
 * Analysiert vendor-spezifische Mediennamen und leitet daraus strukturierte Medienmetadaten ab.
 */
import type { AlarmMediaKind, ParsedVendorMediaResult } from "@leitstelle/contracts";

import { AppError } from "@leitstelle/observability";

import { normalizeVendorEventType } from "./vendor-profiles.js";

type ParsedVendorMediaEnvelope = {
  ok: boolean;
  parsed?: ParsedVendorMediaResult;
  error?: string;
};

export function parseVendorMediaFilename(vendor: string, sourceType: string, filename: string): ParsedVendorMediaEnvelope {
  const normalizedVendor = vendor.trim().toLowerCase();
  if (normalizedVendor === "grundig") {
    return parseGroundigMediaFilename(sourceType, filename);
  }
  if (normalizedVendor === "dahua") {
    return parseDahuaMediaFilename(sourceType, filename);
  }
  if (normalizedVendor === "hikvision") {
    return parseHikvisionMediaFilename(sourceType, filename);
  }
  return {
    ok: false,
    error: `No media filename parser is registered for vendor "${normalizedVendor}".`
  };
}

export function parseVendorMediaPath(vendor: string, sourceType: string, relativePath: string): ParsedVendorMediaEnvelope {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const filename = normalizedPath.split("/").filter((segment) => segment.length > 0).at(-1);
  if (!filename) {
    return {
      ok: false,
      error: "Media path does not contain a filename."
    };
  }

  const parsed = parseVendorMediaFilename(vendor, sourceType, filename);
  if (!parsed.ok || !parsed.parsed) {
    return parsed;
  }

  return {
    ok: true,
    parsed: {
      ...parsed.parsed,
      relativePath: normalizedPath
    }
  };
}

export function parseGroundigMediaFilename(sourceType: string, filename: string): ParsedVendorMediaEnvelope {
  const normalizedFilename = filename.trim();
  const match = /^(?<sourceId>[^_][^]*?)__(?<channelId>[^_][^]*?)__(?<eventType>[^_][^]*?)__(?<eventTs>\d{8}T\d{6}Z)__(?:(?<vendorEventId>[^_][^]*?)__)?(?:(?<imgToken>img_(?<sequence>\d{3}))|(?<clipToken>clip))\.(?<extension>[A-Za-z0-9]+)$/u.exec(normalizedFilename);
  if (!match?.groups) {
    return {
      ok: false,
      error: `Unsupported Grundig media filename "${normalizedFilename}".`
    };
  }

  const sourceId = match.groups["sourceId"]?.trim();
  const channelId = match.groups["channelId"]?.trim();
  const rawEventType = match.groups["eventType"]?.trim();
  const eventTs = match.groups["eventTs"]?.trim();
  if (!sourceId || !channelId || !rawEventType || !eventTs) {
    return {
      ok: false,
      error: `Grundig media filename "${normalizedFilename}" is missing required segments.`
    };
  }

  const mediaKind = resolveMediaKind(match.groups["clipToken"], normalizedFilename);
  const mediaType = mediaKind === "clip" ? "clip" : "image";
  const vendorEventId = normalizeOptional(match.groups["vendorEventId"]);
  const sequenceNo = match.groups["sequence"] ? Number(match.groups["sequence"]) : undefined;
  const eventType = normalizeVendorEventType("grundig", sourceType, rawEventType);
  const channelNumber = parseChannelNumber(channelId);
  const correlationKey = buildVendorMediaCorrelationKey({
    vendor: "grundig",
    sourceType,
    sourceId,
    channelId,
    eventType,
    eventTs,
    ...(vendorEventId ? { vendorEventId } : {})
  });

  return {
    ok: true,
    parsed: {
      vendor: "grundig",
      sourceType,
      parserKey: "groundig-standard-v1",
      filename: normalizedFilename,
      sourceId,
      sourceName: sourceId,
      channelId,
      ...(channelNumber !== undefined ? { channelNumber } : {}),
      eventType,
      eventTs: toIsoTimestamp(eventTs),
      ...(vendorEventId ? { vendorEventId } : {}),
      ...(sourceType === "camera"
        ? { externalDeviceId: sourceId }
        : sourceType === "nvr"
          ? { externalRecorderId: sourceId }
          : {}),
      correlationKey,
      mediaKind,
      mediaType,
      ...(sequenceNo ? { sequenceNo } : {})
    }
  };
}

export const parseGrundigMediaFilename = parseGroundigMediaFilename;

export function parseGroundigMediaPath(sourceType: string, relativePath: string): ParsedVendorMediaEnvelope {
  return parseVendorMediaPath("grundig", sourceType, relativePath);
}

export const parseGrundigMediaPath = parseGroundigMediaPath;

export function parseDahuaMediaFilename(sourceType: string, filename: string): ParsedVendorMediaEnvelope {
  return parseVendorMediaByPatterns("dahua", sourceType, filename, [
    { key: "dahua-structured-v1", parser: parseStructuredVendorMediaFilename },
    { key: "dahua-legacy-underscore-v1", parser: parseLegacyUnderscoreVendorMediaFilename }
  ]);
}

export function parseDahuaMediaPath(sourceType: string, relativePath: string): ParsedVendorMediaEnvelope {
  return parseVendorMediaPath("dahua", sourceType, relativePath);
}

export function parseHikvisionMediaFilename(sourceType: string, filename: string): ParsedVendorMediaEnvelope {
  return parseVendorMediaByPatterns("hikvision", sourceType, filename, [
    { key: "hikvision-structured-v1", parser: parseStructuredVendorMediaFilename },
    { key: "hikvision-legacy-underscore-v1", parser: parseLegacyUnderscoreVendorMediaFilename }
  ]);
}

export function parseHikvisionMediaPath(sourceType: string, relativePath: string): ParsedVendorMediaEnvelope {
  return parseVendorMediaPath("hikvision", sourceType, relativePath);
}

export function buildVendorMediaCorrelationKey(input: {
  vendor: string;
  sourceType: string;
  sourceId: string;
  channelId?: string;
  eventType: string;
  eventTs: string;
  vendorEventId?: string;
}): string {
  const base = [
    input.vendor.trim().toLowerCase(),
    input.sourceType.trim().toLowerCase(),
    input.sourceId.trim(),
    input.channelId?.trim() ?? "",
    input.eventType.trim().toLowerCase(),
    input.eventTs.trim()
  ].join("__");
  return input.vendorEventId?.trim()
    ? `${base}__${input.vendorEventId.trim()}`
    : base;
}

function resolveMediaKind(rawClipToken: string | undefined, filename: string): AlarmMediaKind {
  if (rawClipToken) {
    return "clip";
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(filename)) {
    return "snapshot";
  }
  throw new AppError("Unsupported media file extension.", {
    status: 400,
    code: "ALARM_MEDIA_FILENAME_UNSUPPORTED"
  });
}

function toIsoTimestamp(compactTimestamp: string): string {
  const match = /^(?<date>\d{8})T(?<time>\d{6})Z$/.exec(compactTimestamp);
  if (!match?.groups) {
    return compactTimestamp;
  }

  const date = match.groups["date"]!;
  const time = match.groups["time"]!;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`;
}

function normalizeOptional(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function parseVendorMediaByPatterns(
  vendor: string,
  sourceType: string,
  filename: string,
  patterns: Array<{
    key: string;
    parser: (
      vendor: string,
      sourceType: string,
      filename: string,
      parserKey: string
    ) => ParsedVendorMediaEnvelope;
  }>
): ParsedVendorMediaEnvelope {
  for (const pattern of patterns) {
    const parsed = pattern.parser(vendor, sourceType, filename, pattern.key);
    if (parsed.ok) {
      return parsed;
    }
  }

  return {
    ok: false,
    error: `Unsupported ${capitalizeVendor(vendor)} media filename "${filename.trim()}".`
  };
}

function parseStructuredVendorMediaFilename(
  vendor: string,
  sourceType: string,
  filename: string,
  parserKey: string
): ParsedVendorMediaEnvelope {
  const normalizedFilename = filename.trim();
  const match = /^(?<sourceId>[^_][^]*?)__(?<channelId>[^_][^]*?)__(?<eventType>[^_][^]*?)__(?<eventTs>\d{8}T\d{6}Z)__(?:(?<vendorEventId>[^_][^]*?)__)?(?:(?<imgToken>img_(?<sequence>\d{3}))|(?<clipToken>clip))\.(?<extension>[A-Za-z0-9]+)$/u.exec(normalizedFilename);
  if (!match?.groups) {
    return { ok: false, error: "pattern_mismatch" };
  }

  return buildParsedVendorMediaResult(vendor, sourceType, parserKey, normalizedFilename, {
    ...(match.groups["sourceId"] ? { sourceId: match.groups["sourceId"] } : {}),
    ...(match.groups["channelId"] ? { channelId: match.groups["channelId"] } : {}),
    ...(match.groups["eventType"] ? { eventType: match.groups["eventType"] } : {}),
    ...(match.groups["eventTs"] ? { eventTs: match.groups["eventTs"] } : {}),
    ...(match.groups["vendorEventId"] ? { vendorEventId: match.groups["vendorEventId"] } : {}),
    ...(match.groups["sequence"] ? { sequenceNo: Number(match.groups["sequence"]) } : {}),
    ...(match.groups["clipToken"] ? { clipToken: match.groups["clipToken"] } : {})
  });
}

function parseLegacyUnderscoreVendorMediaFilename(
  vendor: string,
  sourceType: string,
  filename: string,
  parserKey: string
): ParsedVendorMediaEnvelope {
  const normalizedFilename = filename.trim();
  const match = /^(?<sourceId>.+)_(?<channelId>CH\d{1,3}|CAM\d{1,3}|CHANNEL\d{1,3}|\d{1,3})_(?<eventType>[A-Za-z][A-Za-z0-9]+)_(?<eventTs>\d{8}T?\d{6}Z?)_(?:(?<vendorEventId>[A-Za-z0-9-]+)_)?(?:(?<sequence>\d{3})|(?<clipToken>clip))\.(?<extension>[A-Za-z0-9]+)$/u.exec(normalizedFilename);
  if (!match?.groups) {
    return { ok: false, error: "pattern_mismatch" };
  }
  const normalizedChannelId = normalizeLegacyChannelId(match.groups["channelId"]);
  const normalizedEventTs = normalizeLegacyTimestamp(match.groups["eventTs"]);

  return buildParsedVendorMediaResult(vendor, sourceType, parserKey, normalizedFilename, {
    ...(match.groups["sourceId"] ? { sourceId: match.groups["sourceId"] } : {}),
    ...(normalizedChannelId ? { channelId: normalizedChannelId } : {}),
    ...(match.groups["eventType"] ? { eventType: match.groups["eventType"] } : {}),
    ...(normalizedEventTs ? { eventTs: normalizedEventTs } : {}),
    ...(match.groups["vendorEventId"] ? { vendorEventId: match.groups["vendorEventId"] } : {}),
    ...(match.groups["sequence"] ? { sequenceNo: Number(match.groups["sequence"]) } : {}),
    ...(match.groups["clipToken"] ? { clipToken: match.groups["clipToken"] } : {})
  });
}

function buildParsedVendorMediaResult(
  vendor: string,
  sourceType: string,
  parserKey: string,
  filename: string,
  input: {
    sourceId?: string;
    channelId?: string;
    eventType?: string;
    eventTs?: string;
    vendorEventId?: string;
    sequenceNo?: number;
    clipToken?: string;
  }
): ParsedVendorMediaEnvelope {
  const sourceId = normalizeOptional(input.sourceId);
  const channelId = normalizeOptional(input.channelId);
  const rawEventType = normalizeOptional(input.eventType);
  const eventTs = normalizeOptional(input.eventTs);
  if (!sourceId || !channelId || !rawEventType || !eventTs) {
    return {
      ok: false,
      error: `${capitalizeVendor(vendor)} media filename "${filename}" is missing required segments.`
    };
  }

  const mediaKind = resolveMediaKind(input.clipToken, filename);
  const mediaType = mediaKind === "clip" ? "clip" : "image";
  const vendorEventId = normalizeOptional(input.vendorEventId);
  const eventType = normalizeVendorEventType(vendor, sourceType, rawEventType);
  const correlationKey = buildVendorMediaCorrelationKey({
    vendor,
    sourceType,
    sourceId,
    channelId,
    eventType,
    eventTs,
    ...(vendorEventId ? { vendorEventId } : {})
  });
  const channelNumber = parseChannelNumber(channelId);

  return {
    ok: true,
    parsed: {
      vendor,
      sourceType,
      parserKey,
      filename,
      sourceId,
      sourceName: sourceId,
      channelId,
      ...(channelNumber !== undefined ? { channelNumber } : {}),
      eventType,
      eventTs: toIsoTimestamp(eventTs),
      ...(vendorEventId ? { vendorEventId } : {}),
      ...(sourceType === "camera"
        ? { externalDeviceId: sourceId }
        : sourceType === "nvr"
          ? { externalRecorderId: sourceId }
          : {}),
      correlationKey,
      mediaKind,
      mediaType,
      ...(input.sequenceNo ? { sequenceNo: input.sequenceNo } : {})
    }
  };
}

function normalizeLegacyTimestamp(compactTimestamp: string | undefined): string | undefined {
  const normalized = normalizeOptional(compactTimestamp);
  if (!normalized) {
    return undefined;
  }
  if (/^\d{8}T\d{6}Z$/.test(normalized)) {
    return normalized;
  }
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return `${normalized}Z`;
  }
  if (/^\d{14}$/.test(normalized)) {
    return `${normalized.slice(0, 8)}T${normalized.slice(8)}Z`;
  }
  return normalized;
}

function normalizeLegacyChannelId(rawChannelId: string | undefined): string | undefined {
  const normalized = normalizeOptional(rawChannelId);
  if (!normalized) {
    return undefined;
  }
  if (/^CH\d{1,3}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  if (/^CHANNEL\d{1,3}$/i.test(normalized)) {
    const numeric = normalized.replace(/[^0-9]/gi, "");
    return `CH${numeric.padStart(2, "0")}`;
  }
  if (/^CAM\d{1,3}$/i.test(normalized)) {
    const numeric = normalized.replace(/[^0-9]/gi, "");
    return `CH${numeric.padStart(2, "0")}`;
  }
  if (/^\d{1,3}$/.test(normalized)) {
    return `CH${normalized.padStart(2, "0")}`;
  }
  return normalized;
}

function parseChannelNumber(channelId: string | undefined): number | undefined {
  const normalized = normalizeOptional(channelId);
  if (!normalized) {
    return undefined;
  }
  const match = /\d+/.exec(normalized);
  return match ? Number(match[0]) : undefined;
}

function capitalizeVendor(vendor: string): string {
  return vendor.length > 0 ? `${vendor[0]!.toUpperCase()}${vendor.slice(1)}` : vendor;
}