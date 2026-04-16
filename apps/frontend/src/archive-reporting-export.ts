/**
 * Baut CSV-Exporte fuer Archiv- und Reportingdaten aus den geladenen Frontend-Modellen.
 */
import type { AlarmArchiveResult, ReportingOverview } from "@leitstelle/contracts";

export function buildArchiveExportCsv(archive: AlarmArchiveResult): string {
  const rows = [
    [
      "id",
      "titel",
      "prioritaet",
      "lifecycle_status",
      "bewertung",
      "alarmtyp",
      "kunde",
      "standort",
      "primaergeraet",
      "eingang",
      "abschluss",
      "archiviert",
      "abschlussgrund",
      "geschlossen_von",
      "archiviert_von",
      "event_count",
      "media_count"
    ],
    ...archive.items.map((item) => [
      item.id,
      item.title,
      item.priority,
      item.lifecycleStatus,
      item.assessmentStatus,
      item.alarmType,
      item.customerName,
      item.siteName,
      item.primaryDeviceName ?? "",
      item.receivedAt,
      item.resolvedAt ?? "",
      item.archivedAt ?? "",
      item.closureReasonLabel ?? "",
      item.closedByDisplayName ?? item.closedByUserId ?? "",
      item.archivedByDisplayName ?? item.archivedByUserId ?? "",
      String(item.eventCount),
      String(item.mediaCount)
    ])
  ];

  return rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
}

export function buildReportingExportCsv(reporting: ReportingOverview): string {
  const rows: string[][] = [
    ["bereich", "typ", "schluessel", "label", "wert", "sample_count", "average_seconds", "maximum_seconds", "total_seconds", "hinweis"],
    ["meta", "zeitraum", reporting.range.period, reporting.range.label, "", "", "", "", "", ""]
  ];

  for (const [key, value] of Object.entries(reporting.filter)) {
    rows.push(["meta", "filter", key, key, String(value ?? ""), "", "", "", "", ""]);
  }

  for (const [key, metric] of Object.entries(reporting.alarms.counts)) {
    rows.push(["alarm", "count", key, metric.label, String(metric.value), "", "", "", "", metric.hint ?? ""]);
  }
  for (const [key, metric] of Object.entries(reporting.monitoring.counts)) {
    rows.push(["monitoring", "count", key, metric.label, String(metric.value), "", "", "", "", metric.hint ?? ""]);
  }
  for (const [key, metric] of Object.entries(reporting.alarms.durations)) {
    rows.push([
      "alarm",
      "duration",
      key,
      metric.label,
      "",
      String(metric.sampleCount),
      metric.averageSeconds !== undefined ? String(metric.averageSeconds) : "",
      metric.maximumSeconds !== undefined ? String(metric.maximumSeconds) : "",
      metric.totalSeconds !== undefined ? String(metric.totalSeconds) : "",
      ""
    ]);
  }
  for (const [key, metric] of Object.entries(reporting.monitoring.durations)) {
    rows.push([
      "monitoring",
      "duration",
      key,
      metric.label,
      "",
      String(metric.sampleCount),
      metric.averageSeconds !== undefined ? String(metric.averageSeconds) : "",
      metric.maximumSeconds !== undefined ? String(metric.maximumSeconds) : "",
      metric.totalSeconds !== undefined ? String(metric.totalSeconds) : "",
      ""
    ]);
  }
  for (const group of reporting.alarms.groups) {
    rows.push(["alarm", "group", group.key, group.label, String(group.value), "", "", "", "", group.hint ?? ""]);
  }
  for (const group of reporting.monitoring.groups) {
    rows.push(["monitoring", "group", group.key, group.label, String(group.value), "", "", "", "", group.hint ?? ""]);
  }

  return rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(";") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
