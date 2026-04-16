import { Buffer } from "node:buffer";

import type { AlarmMediaAccessDocument, AlarmMediaAccessMode } from "@leitstelle/contracts";

import type { AlarmMediaAccessContext } from "./types.js";

export type MediaAccessOptions = {
  mediaStorageBaseUrl?: string;
};

export function createMediaAccessDocument(
  context: AlarmMediaAccessContext,
  mode: AlarmMediaAccessMode,
  usage: "active" | "archive",
  options: MediaAccessOptions = {}
): AlarmMediaAccessDocument {
  const embedded = parseEmbeddedMedia(context.media.storageKey);
  if (embedded) {
    return {
      mediaId: context.media.id,
      alarmCaseId: context.alarmCase.id,
      mode,
      filename: buildMediaFilename(context, embedded.extension),
      mimeType: embedded.mimeType,
      contentBase64: embedded.contentBase64,
      title: buildMediaTitle(context),
      sourceKind: "embedded"
    };
  }

  if (mode === "inline") {
    const previewHtml = renderMediaPreviewHtml(context, usage, options);
    return {
      mediaId: context.media.id,
      alarmCaseId: context.alarmCase.id,
      mode,
      filename: buildMediaFilename(context, "html"),
      mimeType: "text/html; charset=utf-8",
      contentBase64: Buffer.from(previewHtml, "utf-8").toString("base64"),
      title: buildMediaTitle(context),
      sourceKind: "reference_preview"
    };
  }

  const manifest = renderMediaDownloadManifest(context, usage, options);
  return {
    mediaId: context.media.id,
    alarmCaseId: context.alarmCase.id,
    mode,
    filename: buildMediaFilename(context, "txt"),
    mimeType: "text/plain; charset=utf-8",
    contentBase64: Buffer.from(manifest, "utf-8").toString("base64"),
    title: buildMediaTitle(context),
    sourceKind: "reference_preview"
  };
}

function parseEmbeddedMedia(storageKey: string): { mimeType: string; contentBase64: string; extension: string } | null {
  const match = /^data:([^;,]+)((?:;[^,;=]+(?:=[^,;]+)?)*)?,(.*)$/s.exec(storageKey);
  if (!match) {
    return null;
  }

  const mimeType = match[1] ?? "application/octet-stream";
  const parameters = (match[2] ?? "").split(";").filter(Boolean);
  const isBase64 = parameters.includes("base64");
  const rawPayload = match[3] ?? "";
  const contentBase64 = isBase64
    ? rawPayload
    : Buffer.from(decodeURIComponent(rawPayload), "utf-8").toString("base64");

  return {
    mimeType,
    contentBase64,
    extension: extensionFromMimeType(mimeType)
  };
}

function renderMediaPreviewHtml(context: AlarmMediaAccessContext, usage: "active" | "archive", options: MediaAccessOptions): string {
  const escapedTitle = escapeHtml(buildMediaTitle(context));
  const escapedStorageKey = escapeHtml(context.media.storageKey);
  const resolvedStorageReference = resolveMediaReferenceUrl(context.media.storageKey, options.mediaStorageBaseUrl);
  const escapedSite = escapeHtml(context.siteName);
  const escapedCustomer = escapeHtml(context.customerName);
  const escapedDevice = escapeHtml(context.deviceName ?? "-");
  const escapedMime = escapeHtml(context.media.mimeType ?? "unbekannt");
  const escapedCapturedAt = escapeHtml(context.media.capturedAt ?? "-");
  const previewEmbed = buildRemoteEmbed(context, resolvedStorageReference);
  const usageHeadline = usage === "archive" ? "Archivierter Medienzugriff" : "Operative Medienvorschau";
  const usageText = usage === "archive"
    ? "Archivierter Medienzugriff auf Basis der vorhandenen Medienreferenz. Wenn das Rohmedium nicht direkt in der Codebasis oder als eingebetteter Dateninhalt vorliegt, wird eine browserfaehige Referenzvorschau erzeugt."
    : "Operative Medienvorschau auf Basis der vorhandenen Alarmmedienreferenz. Der Zugriff bleibt auf den aktiven Fallkontext begrenzt und erzeugt nur eine kontrollierte Vorschau, keine allgemeine Medienbibliothek.";

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #f3f0e8; color: #1d2a2f; }
      main { max-width: 980px; margin: 0 auto; display: grid; gap: 20px; }
      .card { background: rgba(255,255,255,0.9); border: 1px solid rgba(29,42,47,0.12); border-radius: 20px; padding: 20px; }
      .facts { display: grid; gap: 10px; }
      .facts div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid rgba(29,42,47,0.1); padding-bottom: 8px; }
      .preview { min-height: 320px; display: grid; place-items: center; background: linear-gradient(180deg, #f8f4eb 0%, #ece3d2 100%); border-radius: 18px; border: 1px dashed rgba(29,42,47,0.18); overflow: hidden; }
      .preview img, .preview iframe, .preview video, .preview audio { max-width: 100%; width: 100%; }
      code { word-break: break-all; white-space: pre-wrap; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>${escapedTitle}</h1>
        <p>${usageHeadline} auf Basis der vorhandenen Medienreferenz.</p>
        <p>${usageText}</p>
      </section>
      <section class="card preview">
        ${previewEmbed}
      </section>
      <section class="card facts">
        <div><strong>Standort</strong><span>${escapedSite}</span></div>
        <div><strong>Kunde</strong><span>${escapedCustomer}</span></div>
        <div><strong>Geraet</strong><span>${escapedDevice}</span></div>
        <div><strong>Medientyp</strong><span>${escapeHtml(context.media.mediaKind)}</span></div>
        <div><strong>MIME</strong><span>${escapedMime}</span></div>
        <div><strong>Erfasst</strong><span>${escapedCapturedAt}</span></div>
      </section>
      <section class="card">
        <h2>Speicherreferenz</h2>
        <code>${escapedStorageKey}</code>
        ${resolvedStorageReference && resolvedStorageReference !== context.media.storageKey
          ? `<p><strong>Aufgeloeste URL:</strong><br /><code>${escapeHtml(resolvedStorageReference)}</code></p>`
          : ""}
      </section>
    </main>
  </body>
</html>`;
}

function buildRemoteEmbed(context: AlarmMediaAccessContext, resolvedStorageReference: string | null): string {
  const storageKey = resolvedStorageReference ?? context.media.storageKey;
  const escapedStorageKey = escapeHtml(storageKey);
  const mimeType = context.media.mimeType ?? "";

  if (/^https?:\/\//i.test(storageKey)) {
    if (mimeType.startsWith("image/")) {
      return `<img src="${escapedStorageKey}" alt="${escapeHtml(buildMediaTitle(context))}" />`;
    }

    if (mimeType.startsWith("video/")) {
      return `<video src="${escapedStorageKey}" controls preload="metadata"></video>`;
    }

    if (mimeType.startsWith("audio/")) {
      return `<audio src="${escapedStorageKey}" controls preload="metadata"></audio>`;
    }

    if (mimeType === "application/pdf") {
      return `<iframe src="${escapedStorageKey}" title="${escapeHtml(buildMediaTitle(context))}" style="height: 70vh; border: 0;"></iframe>`;
    }
  }

  return `<div>
    <h2>Referenzvorschau</h2>
    <p>Fuer diese Medienreferenz ist kein direkt eingebettetes Rohmedium verfuegbar. Die Referenz bleibt dennoch nachvollziehbar und kann fuer weitere operative Bearbeitung oder externe Ablage genutzt werden.</p>
    <p><strong>Storage Key:</strong><br /><code>${escapedStorageKey}</code></p>
  </div>`;
}

function renderMediaDownloadManifest(context: AlarmMediaAccessContext, usage: "active" | "archive", options: MediaAccessOptions): string {
  const resolvedStorageReference = resolveMediaReferenceUrl(context.media.storageKey, options.mediaStorageBaseUrl);
  return [
    `${usage === "archive" ? "Archivmedium" : "Aktivfallmedium"} ${context.media.id}`,
    `Alarmfall: ${context.alarmCase.id}`,
    `Titel: ${context.alarmCase.title}`,
    `Standort: ${context.siteName}`,
    `Kunde: ${context.customerName}`,
    `Geraet: ${context.deviceName ?? "-"}`,
    `Medienart: ${context.media.mediaKind}`,
    `MIME: ${context.media.mimeType ?? "-"}`,
    `Erfasst: ${context.media.capturedAt ?? "-"}`,
    `Storage Key: ${context.media.storageKey}`,
    ...(resolvedStorageReference && resolvedStorageReference !== context.media.storageKey
      ? [`Resolved URL: ${resolvedStorageReference}`]
      : []),
    "",
    "Hinweis:",
    usage === "archive"
      ? "Dieser Download stellt bewusst keinen direkten Rohmedienexport bereit, sondern ein kontrolliertes Manifest fuer den Archivkontext."
      : "Dieser Download stellt bewusst keinen direkten Rohmedienexport bereit, sondern ein kontrolliertes Manifest fuer den aktiven Fallkontext."
  ].join("\n");
}

function buildMediaTitle(context: AlarmMediaAccessContext): string {
  return `${context.alarmCase.title} | ${context.media.mediaKind} | ${context.siteName}`;
}

function buildMediaFilename(context: AlarmMediaAccessContext, extension: string): string {
  return `${context.alarmCase.id}-${context.media.id}.${extension}`;
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function resolveMediaReferenceUrl(storageKey: string, mediaStorageBaseUrl: string | undefined): string | null {
  if (/^https?:\/\//i.test(storageKey)) {
    return storageKey;
  }
  if (!mediaStorageBaseUrl) {
    return null;
  }
  if (!storageKey.startsWith("/")) {
    return null;
  }
  return `${mediaStorageBaseUrl}${storageKey}`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
