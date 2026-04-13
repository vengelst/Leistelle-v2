import { Buffer } from "node:buffer";

import type {
  AlarmCaseExportDocument,
  AlarmCaseExportFormat,
  AlarmCaseDetail,
  AlarmCaseReport,
  AlarmClosureReason,
  AlarmFalsePositiveReason,
  AlarmMediaRecord,
  AlarmAssignmentRecord,
  UserRole
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { MasterDataService } from "../master-data/service.js";
import type { AlarmCoreStore } from "./types.js";

export type AlarmCaseReportService = {
  getReport: (token: string, alarmCaseId: string, requestId: string) => Promise<AlarmCaseReport>;
  exportReport: (token: string, alarmCaseId: string, format: AlarmCaseExportFormat, requestId: string) => Promise<AlarmCaseExportDocument>;
};

type CreateAlarmCaseReportServiceInput = {
  identity: IdentityService;
  masterData: MasterDataService;
  store: AlarmCoreStore;
  audit: AuditTrail;
};

const exportRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];

export function createAlarmCaseReportService(input: CreateAlarmCaseReportServiceInput): AlarmCaseReportService {
  return {
    async getReport(token, alarmCaseId, requestId) {
      const session = await requireReportAccess(input.identity, token);
      const report = await buildCaseReport(input, alarmCaseId, token, requestId, session.user.id);

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.report.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId
        },
        { requestId }
      );

      return report;
    },
    async exportReport(token, alarmCaseId, format, requestId) {
      const session = await requireReportAccess(input.identity, token);
      const report = await buildCaseReport(input, alarmCaseId, token, requestId, session.user.id);
      const document = createExportDocument(report, format);

      await input.audit.record(
        {
          category: "alarm.case",
          action: "alarm.case.export.created",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            format,
            filename: document.filename
          }
        },
        { requestId }
      );

      return document;
    }
  };
}

async function requireReportAccess(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!session.user.roles.some((role) => exportRoles.includes(role))) {
    throw new AppError("User is not allowed to read or export alarm case reports.", {
      status: 403,
      code: "ALARM_CASE_REPORT_FORBIDDEN"
    });
  }
  return session;
}

async function buildCaseReport(
  input: CreateAlarmCaseReportServiceInput,
  alarmCaseId: string,
  token: string,
  requestId: string,
  actorUserId: string
): Promise<AlarmCaseReport> {
  const [detail, overview, actor] = await Promise.all([
    input.store.getCaseDetail(alarmCaseId),
    input.masterData.getOverview(token, requestId),
    input.identity.getUserById(actorUserId)
  ]);

  if (!detail) {
    throw new AppError("Alarm case not found.", {
      status: 404,
      code: "ALARM_CASE_NOT_FOUND"
    });
  }

  const site = overview.sites.find((entry) => entry.id === detail.alarmCase.siteId);
  if (!site) {
    throw new AppError("Alarm case site context is missing.", {
      status: 404,
      code: "ALARM_CASE_SITE_CONTEXT_NOT_FOUND"
    });
  }

  const primaryDevice = detail.alarmCase.primaryDeviceId
    ? site.devices.find((entry) => entry.id === detail.alarmCase.primaryDeviceId)
    : undefined;

  const actorIds = collectActorIds(detail);
  const actorMap = new Map<string, Awaited<ReturnType<IdentityService["getUserById"]>>>();
  for (const userId of actorIds) {
    try {
      actorMap.set(userId, await input.identity.getUserById(userId));
    } catch {
      continue;
    }
  }

  const closureReason = detail.closureReason;
  const falsePositiveReasons = detail.falsePositiveReasons;
  const assignments = detail.assignments.map((assignment) => ({
    ...assignment,
    ...(actorMap.get(assignment.userId)?.displayName ? { displayName: actorMap.get(assignment.userId)!.displayName } : {})
  }));

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: {
      id: actor.id,
      displayName: actor.displayName,
      primaryRole: actor.primaryRole
    },
    alarmCase: detail.alarmCase,
    site: {
      id: site.id,
      siteName: site.siteName,
      customerId: site.customer.id,
      customerName: site.customer.name,
      address: `${site.address.street}, ${site.address.postalCode} ${site.address.city}, ${site.address.country}`
    },
    ...(primaryDevice
      ? {
          primaryDevice: {
            id: primaryDevice.id,
            name: primaryDevice.name,
            type: primaryDevice.type
          }
        }
      : {}),
    actors: [...actorMap.values()].map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      primaryRole: entry.primaryRole
    })),
    events: detail.events,
    media: detail.media,
    assignments,
    comments: detail.comments,
    actions: detail.actions,
    falsePositiveReasons,
    ...(closureReason ? { closureReason } : {}),
    isArchived: detail.isArchived,
    narrative: buildNarrative(detail.alarmCase.title, detail.alarmCase, assignments, detail.media, detail.comments, detail.actions, falsePositiveReasons, closureReason)
  };
}

function collectActorIds(detail: AlarmCaseDetail): string[] {
  const ids = new Set<string>();
  for (const entry of detail.assignments) ids.add(entry.userId);
  for (const entry of detail.comments) ids.add(entry.userId);
  for (const entry of detail.actions) ids.add(entry.userId);
  for (const entry of detail.events) {
    if (entry.actorUserId) ids.add(entry.actorUserId);
  }
  if (detail.alarmCase.closedByUserId) ids.add(detail.alarmCase.closedByUserId);
  if (detail.alarmCase.archivedByUserId) ids.add(detail.alarmCase.archivedByUserId);
  return [...ids];
}

function buildNarrative(
  title: string,
  alarmCase: AlarmCaseReport["alarmCase"],
  assignments: Array<AlarmAssignmentRecord & { displayName?: string }>,
  media: AlarmMediaRecord[],
  comments: AlarmCaseReport["comments"],
  actions: AlarmCaseReport["actions"],
  falsePositiveReasons: AlarmFalsePositiveReason[],
  closureReason?: AlarmClosureReason
): AlarmCaseReport["narrative"] {
  const overview = [
    `${title} wurde am ${alarmCase.receivedAt} als ${alarmCase.alarmType} mit Prioritaet ${alarmCase.priority} angelegt.`,
    `Lifecycle ${alarmCase.lifecycleStatus}, Bewertung ${alarmCase.assessmentStatus}, technischer Zustand ${alarmCase.technicalState}.`,
    media.length > 0 ? `${media.length} Medienverweise wurden dokumentiert.` : "Es liegen keine Medienverweise vor."
  ];

  const progress = [
    assignments.length > 0
      ? `Bearbeiterverlauf: ${assignments.map((entry) => `${entry.displayName ?? entry.userId} (${entry.assignmentStatus})`).join(", ")}.`
      : "Es gab keine Reservierung oder Zuweisung.",
    comments.length > 0
      ? `${comments.length} Kommentare oder Notizen sind in der Fallakte hinterlegt.`
      : "Keine zusaetzlichen Kommentare in der Fallakte."
  ];

  const actionLines = actions.length > 0
    ? actions.map((entry) => `${entry.occurredAt}: ${entry.actionTypeLabel} -> ${entry.statusLabel} (${entry.userDisplayName ?? entry.userId})`)
    : ["Keine dokumentierten Massnahmen."];

  const completion = [
    alarmCase.resolvedAt
      ? `Der Fall wurde am ${alarmCase.resolvedAt} abgeschlossen${closureReason ? ` mit Abschlussgrund ${closureReason.label}` : ""}.`
      : "Der Fall ist noch nicht abgeschlossen.",
    alarmCase.assessmentStatus === "false_positive" && falsePositiveReasons.length > 0
      ? `Fehlalarmgruende: ${falsePositiveReasons.map((entry) => entry.label).join(", ")}.`
      : "Keine Fehlalarmgruende hinterlegt.",
    alarmCase.archivedAt ? `Der Fall wurde am ${alarmCase.archivedAt} archiviert.` : "Der Fall ist noch nicht archiviert."
  ];

  return {
    overview,
    progress,
    actions: actionLines,
    completion
  };
}

function createExportDocument(report: AlarmCaseReport, format: AlarmCaseExportFormat): AlarmCaseExportDocument {
  if (format === "case_report") {
    const content = renderCaseReportText(report);
    return {
      format,
      filename: `${report.alarmCase.id}-fallbericht.txt`,
      mimeType: "text/plain; charset=utf-8",
      contentBase64: Buffer.from(content, "utf-8").toString("base64")
    };
  }

  if (format === "excel") {
    const content = renderCaseReportCsv(report);
    return {
      format,
      filename: `${report.alarmCase.id}-fallbericht.csv`,
      mimeType: "text/csv; charset=utf-8",
      contentBase64: Buffer.from(content, "utf-8").toString("base64")
    };
  }

  const content = renderSimplePdf(report);
  return {
    format,
    filename: `${report.alarmCase.id}-fallbericht.pdf`,
    mimeType: "application/pdf",
    contentBase64: content.toString("base64")
  };
}

function renderCaseReportText(report: AlarmCaseReport): string {
  const lines = [
    `Fallbericht ${report.alarmCase.id}`,
    "",
    "Grunddaten",
    `Titel: ${report.alarmCase.title}`,
    `Standort: ${report.site.siteName}`,
    `Kunde: ${report.site.customerName}`,
    `Adresse: ${report.site.address}`,
    `Alarmtyp: ${report.alarmCase.alarmType}`,
    `Prioritaet: ${report.alarmCase.priority}`,
    `Lifecycle: ${report.alarmCase.lifecycleStatus}`,
    `Bewertung: ${report.alarmCase.assessmentStatus}`,
    `Technik: ${report.alarmCase.technicalState}`,
    `Empfangen: ${report.alarmCase.receivedAt}`,
    `Bearbeitungsbeginn: ${report.alarmCase.firstOpenedAt ?? "-"}`,
    `Abschluss: ${report.alarmCase.resolvedAt ?? "-"}`,
    `Archiviert: ${report.alarmCase.archivedAt ?? "-"}`,
    "",
    "Bearbeiter",
    ...(report.actors.length > 0 ? report.actors.map((entry) => `- ${entry.displayName} (${entry.primaryRole})`) : ["- keine"]),
    "",
    "Verlauf",
    ...report.events.map((entry) => `- ${entry.occurredAt} | ${entry.eventKind}${entry.message ? ` | ${entry.message}` : ""}`),
    "",
    "Massnahmen",
    ...(report.actions.length > 0
      ? report.actions.map((entry) => `- ${entry.occurredAt} | ${entry.actionTypeLabel} | ${entry.statusLabel} | ${entry.userDisplayName ?? entry.userId} | ${entry.comment}`)
      : ["- keine"]),
    "",
    "Kommentare",
    ...(report.comments.length > 0
      ? report.comments.map((entry) => `- ${entry.createdAt} | ${entry.userDisplayName ?? entry.userId} | ${entry.body}`)
      : ["- keine"]),
    "",
    "Medien",
    ...(report.media.length > 0
      ? report.media.map((entry) => `- ${entry.mediaKind} | ${entry.storageKey}${entry.capturedAt ? ` | ${entry.capturedAt}` : ""}`)
      : ["- keine"]),
    "",
    "Abschluss",
    `Abschlussgrund: ${report.closureReason?.label ?? "-"}`,
    `Fehlalarmgruende: ${report.falsePositiveReasons.length > 0 ? report.falsePositiveReasons.map((entry) => entry.label).join(", ") : "-"}`,
    "",
    "Narrativ",
    ...report.narrative.overview.map((entry) => `- ${entry}`),
    ...report.narrative.progress.map((entry) => `- ${entry}`),
    ...report.narrative.actions.map((entry) => `- ${entry}`),
    ...report.narrative.completion.map((entry) => `- ${entry}`)
  ];

  return lines.join("\n");
}

function renderCaseReportCsv(report: AlarmCaseReport): string {
  const rows: string[][] = [
    ["section", "timestamp", "type", "label", "value", "actor"],
    ["case", report.alarmCase.receivedAt, "title", "Titel", report.alarmCase.title, ""],
    ["case", report.alarmCase.receivedAt, "site", "Standort", report.site.siteName, ""],
    ["case", report.alarmCase.receivedAt, "customer", "Kunde", report.site.customerName, ""],
    ["case", report.alarmCase.receivedAt, "status", "Lifecycle", report.alarmCase.lifecycleStatus, ""],
    ["case", report.alarmCase.receivedAt, "assessment", "Bewertung", report.alarmCase.assessmentStatus, ""]
  ];

  for (const event of report.events) {
    rows.push(["event", event.occurredAt, event.eventKind, event.message ?? event.eventKind, JSON.stringify(event.payload ?? {}), event.actorUserId ?? ""]);
  }
  for (const action of report.actions) {
    rows.push(["action", action.occurredAt, action.actionTypeCode, action.actionTypeLabel, action.comment, action.userDisplayName ?? action.userId]);
  }
  for (const comment of report.comments) {
    rows.push(["comment", comment.createdAt, comment.commentKind, comment.userDisplayName ?? comment.userId, comment.body, comment.userId]);
  }
  for (const media of report.media) {
    rows.push(["media", media.createdAt, media.mediaKind, media.storageKey, media.mimeType ?? "", media.deviceId ?? ""]);
  }
  for (const assignment of report.assignments) {
    rows.push(["assignment", assignment.assignedAt, assignment.assignmentKind, assignment.displayName ?? assignment.userId, assignment.assignmentStatus, assignment.userId]);
  }

  return rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
}

function escapeCsv(value: string): string {
  if (/[;"\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function renderSimplePdf(report: AlarmCaseReport): Buffer {
  const sourceLines = renderCaseReportText(report).split("\n");
  const pages = paginateLines(sourceLines, 40);
  const objects: string[] = [];
  const contentObjectIds: number[] = [];
  const pageObjectIds: number[] = [];
  let nextId = 3;

  for (let index = 0; index < pages.length; index += 1) {
    contentObjectIds.push(nextId++);
    pageObjectIds.push(nextId++);
  }
  const fontObjectId = nextId++;

  for (const [index, pageLines] of pages.entries()) {
    const contentObjectId = contentObjectIds[index]!;
    const pageObjectId = pageObjectIds[index]!;
    const stream = buildPdfTextStream(pageLines);
    objects[contentObjectId - 1] = `${contentObjectId} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`;
    objects[pageObjectId - 1] = `${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`;
  }
  objects[fontObjectId - 1] = `${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  objects[0] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[1] = `2 0 obj\n<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`;

  const orderedObjects = [
    objects[0]!,
    objects[1]!,
    ...contentObjectIds.flatMap((contentId, index) => [objects[contentId - 1]!, objects[pageObjectIds[index]! - 1]!]),
    objects[fontObjectId - 1]!
  ];

  const pdfParts = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  for (const object of orderedObjects) {
    offsets.push(Buffer.byteLength(pdfParts.join(""), "utf8"));
    pdfParts.push(object);
  }
  const xrefOffset = Buffer.byteLength(pdfParts.join(""), "utf8");
  pdfParts.push(`xref\n0 ${orderedObjects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= orderedObjects.length; index += 1) {
    pdfParts.push(`${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  pdfParts.push(`trailer\n<< /Size ${orderedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.from(pdfParts.join(""), "utf8");
}

function paginateLines(lines: string[], linesPerPage: number): string[][] {
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }
  return pages.length > 0 ? pages : [["Leerer Fallbericht"]];
}

function buildPdfTextStream(lines: string[]): string {
  const startY = 800;
  const step = 18;
  const commands = ["BT", "/F1 11 Tf"];
  for (const [index, line] of lines.entries()) {
    const y = startY - (index * step);
    commands.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`);
  }
  commands.push("ET");
  return commands.join("\n");
}

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
