import type { AlarmCaseDetail, AlarmMediaRecord } from "@leitstelle/contracts";

import { state } from "../state.js";
import { escapeHtml, formatTimestamp } from "../utils.js";
import { renderEmptyState, renderNotice } from "./common.js";

type RenderAlarmMediaSectionOptions = {
  maxPreviewCount?: number;
};

export function renderAlarmMediaSection(detail: AlarmCaseDetail, options: RenderAlarmMediaSectionOptions = {}): string {
  const maxPreviewCount = options.maxPreviewCount ?? 3;
  const mediaBundles = detail.mediaBundles ?? [];
  const previewMedia = detail.media.slice(0, maxPreviewCount);

  return `
    <article class="subcard stack compact">
      <div class="actions">
        <h4>Snapshot- / Medienbezug</h4>
        <span class="pill">${detail.isArchived ? "Archivzugriff" : "Aktivfallvorschau"}</span>
      </div>
      ${mediaBundles.length > 0 ? `
        <div class="stack compact">
          <strong>Medien-Bundles</strong>
          <div class="operator-media-grid">
            ${mediaBundles.map((bundle) => `
              <article class="subcard stack compact operator-media-card">
                <strong>${escapeHtml(bundle.vendor)} / ${escapeHtml(bundle.sourceId)}</strong>
                <p class="muted">${escapeHtml(bundle.eventType)} | ${formatTimestamp(bundle.eventTs)}${bundle.channelId ? ` | ${escapeHtml(bundle.channelId)}` : ""}</p>
                <p class="muted">${bundle.receivedImages}/${bundle.expectedImages} Bilder | ${bundle.receivedClips}/${bundle.expectedClips} Clips | ${escapeHtml(bundle.completenessState)}</p>
              </article>
            `).join("")}
          </div>
        </div>
      ` : ""}
      ${previewMedia.length > 0
        ? `
          <div class="operator-media-grid">
            ${previewMedia.map((media) => renderMediaCard(detail, media)).join("")}
          </div>
          ${detail.media.length > maxPreviewCount ? `<p class="muted">Weitere Medienverweise: ${detail.media.length - maxPreviewCount}</p>` : ""}
        `
        : renderEmptyState("Fuer diesen Alarm liegen aktuell keine Snapshot- oder Clip-Referenzen vor.")}
      <p class="muted">${detail.isArchived
        ? "Archivierte Medien bleiben am bestehenden Archivzugriff. Die operative Inline-Vorschau ist bewusst auf aktive Alarmfaelle begrenzt."
        : "Die Vorschau nutzt vorhandene Alarmmedienreferenzen im aktiven Fallkontext. Clip-Bezug bleibt pragmatisch auf vorhandene Referenzen und browserfaehige Vorschau begrenzt."}</p>
    </article>
  `;
}

function renderMediaCard(detail: AlarmCaseDetail, media: AlarmMediaRecord): string {
  return `
    <article class="subcard stack compact operator-media-card">
      <strong>${escapeHtml(media.mediaKind)}</strong>
      <p class="muted">${formatTimestamp(media.capturedAt ?? media.createdAt)}${media.deviceId ? ` | ${escapeHtml(media.deviceId)}` : ""}${media.mimeType ? ` | ${escapeHtml(media.mimeType)}` : ""}</p>
      ${detail.isArchived ? `<code>${escapeHtml(media.storageKey)}</code>` : renderInlinePreview(media)}
      <div class="actions">
        <button type="button" class="secondary alarm-media-preview-button" data-media-id="${media.id}">${detail.isArchived ? "Im Browser oeffnen" : "Vorschau oeffnen"}</button>
        <button type="button" class="secondary alarm-media-download-button" data-media-id="${media.id}">${detail.isArchived ? "Download" : "Manifest / Download"}</button>
      </div>
    </article>
  `;
}

function renderInlinePreview(media: AlarmMediaRecord): string {
  const previewError = state.selectedAlarmMediaPreviewErrors[media.id];
  if (previewError) {
    return renderNotice(previewError, "error", true);
  }

  const previewDocument = state.selectedAlarmMediaPreviews[media.id];
  if (!previewDocument) {
    return `<p class="muted">Vorschau wird geladen.</p>`;
  }

  const src = escapeHtml(`data:${previewDocument.mimeType};base64,${previewDocument.contentBase64}`);
  const title = escapeHtml(previewDocument.title);

  if (previewDocument.mimeType.startsWith("image/")) {
    return `<div class="alarm-media-preview-surface"><img class="alarm-media-preview-embed" src="${src}" alt="${title}" /></div>`;
  }

  if (previewDocument.mimeType.startsWith("video/")) {
    return `<div class="alarm-media-preview-surface"><video class="alarm-media-preview-embed" src="${src}" controls preload="metadata"></video></div>`;
  }

  if (previewDocument.mimeType.startsWith("audio/")) {
    return `<div class="alarm-media-preview-surface"><audio class="alarm-media-preview-embed" src="${src}" controls preload="metadata"></audio></div>`;
  }

  return `<div class="alarm-media-preview-surface"><iframe class="alarm-media-preview-frame" src="${src}" title="${title}"></iframe></div>`;
}
