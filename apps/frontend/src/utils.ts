/**
 * Gemeinsame Frontend-Hilfsfunktionen.
 *
 * Die Datei sammelt kleine, moduluebergreifende Utilities fuer Formwerte,
 * Filter-Normalisierung, HTML-Escaping, Downloads und Formatierungen, damit sie
 * nicht in Views und Handlern dupliziert werden.
 */
import type {
  AlarmCaseExportDocument,
  AlarmMediaAccessDocument,
  MonitoringPriority,
  SiteTechnicalOverallStatus,
  UiShellDescriptor
} from "@leitstelle/contracts";

import type { MonitoringFilterState, PipelineFilterState } from "./state.js";

export function readSelectValue<TValue extends string>(formData: FormData, key: string, allowed: readonly TValue[]): TValue {
  const fallback = allowed[0]!;
  const raw = String(formData.get(key) ?? fallback);
  return allowed.includes(raw as TValue) ? (raw as TValue) : fallback;
}

export function normalizeOptionalField(value: FormDataEntryValue | null): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function compactPipelineFilter(filter: PipelineFilterState): PipelineFilterState {
  return {
    ...(filter.siteId ? { siteId: filter.siteId } : {}),
    ...(filter.technicalState ? { technicalState: filter.technicalState } : {}),
    ...(filter.lifecycleScope ? { lifecycleScope: filter.lifecycleScope } : {}),
    ...(filter.assignmentScope && filter.assignmentScope !== "all" ? { assignmentScope: filter.assignmentScope } : {})
  };
}

export function compactMonitoringFilter(filter: MonitoringFilterState): MonitoringFilterState {
  return {
    ...(filter.siteId ? { siteId: filter.siteId } : {}),
    ...(filter.priority ? { priority: filter.priority as MonitoringPriority } : {}),
    ...(filter.siteTechnicalStatus ? { siteTechnicalStatus: filter.siteTechnicalStatus as SiteTechnicalOverallStatus } : {})
  };
}

export function scrollToRegion(regionId: UiShellDescriptor["regions"][number]["id"]): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`#region-${regionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function downloadExportDocument(exportDocument: AlarmCaseExportDocument): void {
  const blob = decodeBase64Document(exportDocument.contentBase64, exportDocument.mimeType);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = exportDocument.filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextDocument(filename: string, content: string, mimeType = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function openAccessDocument(documentToOpen: AlarmMediaAccessDocument): void {
  const blob = decodeBase64Document(documentToOpen.contentBase64, documentToOpen.mimeType);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadAccessDocument(documentToDownload: AlarmMediaAccessDocument): void {
  const blob = decodeBase64Document(documentToDownload.contentBase64, documentToDownload.mimeType);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = documentToDownload.filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function decodeBase64Document(contentBase64: string, mimeType: string): Blob {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-DE");
}

export function formatDuration(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return "-";
  }

  const roundedSeconds = Math.round(durationSeconds);
  const totalMinutes = Math.floor(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return `${roundedSeconds}s`;
}

export function formatDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseDateTimeLocalValue(value: FormDataEntryValue | null): string | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
