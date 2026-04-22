/**
 * Erzeugt Export- und Berichtsdokumente fuer Alarmfaelle und deren Verlaufsdaten.
 */
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
      const document = await createExportDocument(report, format);

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

async function createExportDocument(report: AlarmCaseReport, format: AlarmCaseExportFormat): Promise<AlarmCaseExportDocument> {
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

  const content = await renderSimplePdf(report);
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

type PdfPreviewPanel = {
  title: string;
  subtitle: string;
  accentHex: string;
  storageLabel: string;
  image?: {
    bytes: Buffer;
    width: number;
    height: number;
  };
};

async function renderSimplePdf(report: AlarmCaseReport): Promise<Buffer> {
  const sourceLines = renderCaseReportText(report).split("\n");
  const pages = paginateLines(sourceLines, 40);
  const previewPanels = await collectPdfPreviewPanels(report);
  const objectBuffers: Array<Buffer | undefined> = [];
  const contentObjectIds: number[] = [];
  const pageObjectIds: number[] = [];
  let nextId = 3;

  for (let index = 0; index < pages.length; index += 1) {
    contentObjectIds.push(nextId++);
    pageObjectIds.push(nextId++);
  }
  let previewPageSpec:
    | {
        contentObjectId: number;
        pageObjectId: number;
        imageObjectIds: number[];
      }
    | undefined;

  if (previewPanels.length > 0) {
    const previewImageCount = previewPanels.filter((entry) => entry.image).length;
    const imageObjectIds = Array.from({ length: previewImageCount }, () => nextId++);
    const previewContentObjectId = nextId++;
    const previewPageObjectId = nextId++;
    previewPageSpec = {
      contentObjectId: previewContentObjectId,
      pageObjectId: previewPageObjectId,
      imageObjectIds
    };
    pageObjectIds.push(previewPageObjectId);
  }

  const fontObjectId = nextId++;

  for (const [index, pageLines] of pages.entries()) {
    const contentObjectId = contentObjectIds[index]!;
    const pageObjectId = pageObjectIds[index]!;
    const stream = buildPdfTextStream(pageLines);
    objectBuffers[contentObjectId] = buildPdfStreamObject(contentObjectId, Buffer.from(stream, "utf8"));
    objectBuffers[pageObjectId] = buildPdfObject(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
  }

  if (previewPageSpec) {
    const xObjectEntries: string[] = [];
    let imageIndex = 0;
    for (const panel of previewPanels) {
      if (!panel.image) {
        continue;
      }
      const imageObjectId = previewPageSpec.imageObjectIds[imageIndex]!;
      imageIndex += 1;
      objectBuffers[imageObjectId] = buildPdfJpegObject(imageObjectId, panel.image.bytes, panel.image.width, panel.image.height);
      xObjectEntries.push(`/Im${imageIndex} ${imageObjectId} 0 R`);
    }

    const previewStream = buildPdfPreviewStream(previewPanels);
    objectBuffers[previewPageSpec.contentObjectId] = buildPdfStreamObject(previewPageSpec.contentObjectId, Buffer.from(previewStream, "utf8"));
    const xObjectDictionary = xObjectEntries.length > 0 ? ` /XObject << ${xObjectEntries.join(" ")} >>` : "";
    objectBuffers[previewPageSpec.pageObjectId] = buildPdfObject(
      previewPageSpec.pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >>${xObjectDictionary} >> /Contents ${previewPageSpec.contentObjectId} 0 R >>`
    );
  }

  objectBuffers[fontObjectId] = buildPdfObject(fontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objectBuffers[1] = buildPdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objectBuffers[2] = buildPdfObject(2, `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);

  return finalizePdf(objectBuffers);
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

function buildPdfObject(id: number, body: string): Buffer {
  return Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, "utf8");
}

function buildPdfStreamObject(id: number, streamContent: Buffer): Buffer {
  const header = Buffer.from(`${id} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n`, "utf8");
  const footer = Buffer.from("\nendstream\nendobj\n", "utf8");
  return Buffer.concat([header, streamContent, footer]);
}

function buildPdfJpegObject(id: number, jpegBytes: Buffer, width: number, height: number): Buffer {
  const header = Buffer.from(
    `${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    "utf8"
  );
  const footer = Buffer.from("\nendstream\nendobj\n", "utf8");
  return Buffer.concat([header, jpegBytes, footer]);
}

function finalizePdf(objects: Array<Buffer | undefined>): Buffer {
  const orderedIds: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    if (objects[id]) {
      orderedIds.push(id);
    }
  }
  const header = Buffer.from("%PDF-1.4\n", "utf8");
  const chunks: Buffer[] = [header];
  const offsets = new Map<number, number>();
  let currentOffset = header.length;
  for (const id of orderedIds) {
    offsets.set(id, currentOffset);
    const chunk = objects[id]!;
    chunks.push(chunk);
    currentOffset += chunk.length;
  }

  const xrefStart = currentOffset;
  const xrefLines = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`];
  for (let id = 1; id < objects.length; id += 1) {
    xrefLines.push(`${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(Buffer.from(xrefLines.join(""), "utf8"));
  chunks.push(Buffer.from(trailer, "utf8"));
  return Buffer.concat(chunks);
}

async function collectPdfPreviewPanels(report: AlarmCaseReport): Promise<PdfPreviewPanel[]> {
  const snapshots = report.media
    .filter((entry) => entry.mediaKind === "snapshot")
    .slice(0, 3);

  const panels: PdfPreviewPanel[] = [];
  for (const media of snapshots) {
    const panel: PdfPreviewPanel = {
      title: `Bild ${panels.length + 1}`,
      subtitle: media.capturedAt ?? media.createdAt,
      accentHex: "#4d6f8f",
      storageLabel: media.storageKey.slice(0, 96)
    };
    const embedded = parseEmbeddedMediaDataUrl(media.storageKey);
    if (embedded?.mimeType === "image/svg+xml") {
      const svgSource = embedded.content.toString("utf8");
      const accentMatch = /stop-color=\"(#[0-9a-fA-F]{6})\"/.exec(svgSource);
      const headlineMatch = /<text[^>]*>([^<]+)<\/text>[\s\S]*?<text[^>]*>([^<]+)<\/text>/.exec(svgSource);
      if (accentMatch?.[1]) {
        panel.accentHex = accentMatch[1];
      }
      if (headlineMatch?.[2]) {
        panel.title = headlineMatch[2];
      }
      panels.push(panel);
      continue;
    }
    const jpeg = await resolveJpegImage(media.storageKey, media.mimeType);
    if (jpeg) {
      panel.image = jpeg;
      panels.push(panel);
      continue;
    }
    panels.push(panel);
  }
  return panels;
}

function buildPdfPreviewStream(panels: PdfPreviewPanel[]): string {
  const commands: string[] = ["q"];
  commands.push("BT");
  commands.push("/F1 14 Tf");
  commands.push("1 0 0 1 40 810 Tm (Alarmbilder) Tj");
  commands.push("/F1 10 Tf");
  commands.push("1 0 0 1 40 792 Tm (Direkt in das PDF eingebettete Bildansicht) Tj");
  commands.push("ET");

  const panelWidth = 165;
  const panelHeight = 220;
  const panelBottomY = 520;
  let imageCounter = 0;
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index]!;
    const x = 35 + (index * 175);
    const { r, g, b } = hexToRgb01(panel.accentHex);
    commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    commands.push(`${x} ${panelBottomY} ${panelWidth} ${panelHeight} re f`);
    commands.push("1 1 1 rg");
    commands.push(`${x + 8} ${panelBottomY + 8} ${panelWidth - 16} ${panelHeight - 16} re f`);

    commands.push("BT");
    commands.push("/F1 9 Tf");
    commands.push("0.11 0.16 0.18 rg");
    commands.push(`1 0 0 1 ${x + 12} ${panelBottomY + panelHeight - 28} Tm (${escapePdfText(panel.title)}) Tj`);
    commands.push(`1 0 0 1 ${x + 12} ${panelBottomY + panelHeight - 44} Tm (${escapePdfText(panel.subtitle || "-")}) Tj`);
    commands.push("ET");

    if (panel.image) {
      imageCounter += 1;
      const targetWidth = panelWidth - 24;
      const targetHeight = panelHeight - 78;
      const imageRatio = panel.image.width / panel.image.height;
      const targetRatio = targetWidth / targetHeight;
      let drawWidth = targetWidth;
      let drawHeight = targetHeight;
      if (imageRatio > targetRatio) {
        drawHeight = targetWidth / imageRatio;
      } else {
        drawWidth = targetHeight * imageRatio;
      }
      const drawX = x + ((panelWidth - drawWidth) / 2);
      const drawY = panelBottomY + 18 + ((targetHeight - drawHeight) / 2);
      commands.push("q");
      commands.push(`${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`);
      commands.push(`/Im${imageCounter} Do`);
      commands.push("Q");
    } else {
      commands.push("BT");
      commands.push("/F1 8 Tf");
      commands.push("0.38 0.42 0.46 rg");
      commands.push(`1 0 0 1 ${x + 12} ${panelBottomY + 98} Tm (Bildinhalt nicht als JPEG verfuegbar) Tj`);
      commands.push(`1 0 0 1 ${x + 12} ${panelBottomY + 84} Tm (${escapePdfText(panel.storageLabel)}) Tj`);
      commands.push("ET");
    }
  }
  commands.push("Q");
  return commands.join("\n");
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const normalized = /^#([0-9a-fA-F]{6})$/.exec(hex)?.[1];
  if (!normalized) {
    return { r: 0.3, g: 0.44, b: 0.56 };
  }
  const value = Number.parseInt(normalized, 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255
  };
}

function parseEmbeddedMediaDataUrl(value: string): { mimeType: string; content: Buffer } | null {
  const match = /^data:([^;,]+)((?:;[^,;=]+(?:=[^,;]+)?)*)?,(.*)$/s.exec(value);
  if (!match) {
    return null;
  }
  const mimeType = match[1] ?? "application/octet-stream";
  const parameters = (match[2] ?? "").split(";").filter(Boolean);
  const payload = match[3] ?? "";
  if (parameters.includes("base64")) {
    return { mimeType, content: Buffer.from(payload, "base64") };
  }
  return { mimeType, content: Buffer.from(decodeURIComponent(payload), "utf8") };
}

async function resolveJpegImage(storageKey: string, mimeType?: string): Promise<PdfPreviewPanel["image"] | undefined> {
  const embedded = parseEmbeddedMediaDataUrl(storageKey);
  if (embedded && (embedded.mimeType === "image/jpeg" || embedded.mimeType === "image/jpg")) {
    const size = parseJpegSize(embedded.content);
    return size ? { bytes: embedded.content, ...size } : undefined;
  }

  if (!/^https?:\/\//i.test(storageKey)) {
    return undefined;
  }

  if (mimeType && !mimeType.startsWith("image/")) {
    return undefined;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(storageKey, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      return undefined;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("jpeg") && !contentType.includes("jpg")) {
      return undefined;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const size = parseJpegSize(bytes);
    return size ? { bytes, ...size } : undefined;
  } catch {
    return undefined;
  }
}

function parseJpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) {
      return null;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) {
        return { width, height };
      }
      return null;
    }
    offset += 2 + length;
  }
  return null;
}