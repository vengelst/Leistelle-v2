import assert from "node:assert/strict";
import test from "node:test";

import { createMediaAccessDocument } from "../modules/alarm-core/media-access.js";

test("media access resolves relative storage keys with configured base url", () => {
  const document = createMediaAccessDocument({
    alarmCase: {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "received",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Nordtor Alarm",
      receivedAt: "2026-04-12T18:00:00.000Z",
      lastEventAt: "2026-04-12T18:00:00.000Z",
      createdAt: "2026-04-12T18:00:00.000Z",
      updatedAt: "2026-04-12T18:00:00.000Z",
      responseDeadlineState: "within_deadline",
      isEscalationReady: false
    },
    media: {
      id: "media-1",
      alarmCaseId: "alarm-1",
      mediaKind: "snapshot",
      storageKey: "/alarms/2026/04/KW15/12/example/image.jpg",
      mimeType: "image/jpeg",
      isPrimary: true,
      createdAt: "2026-04-12T18:00:01.000Z"
    },
    siteName: "Standort Nord",
    customerName: "Pilotkunde"
  }, "inline", "active", {
    mediaStorageBaseUrl: "https://leitstelle.vivahome.de/media"
  });

  assert.equal(document.sourceKind, "reference_preview");
  const html = Buffer.from(document.contentBase64, "base64").toString("utf-8");
  assert.match(html, /https:\/\/leitstelle\.vivahome\.de\/media\/alarms\/2026\/04\/KW15\/12\/example\/image\.jpg/);
});

test("media access supports utf8 svg data urls as embedded content", () => {
  const document = createMediaAccessDocument({
    alarmCase: {
      id: "alarm-utf8",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "received",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "UTF8 SVG Alarm",
      receivedAt: "2026-04-12T18:00:00.000Z",
      lastEventAt: "2026-04-12T18:00:00.000Z",
      createdAt: "2026-04-12T18:00:00.000Z",
      updatedAt: "2026-04-12T18:00:00.000Z",
      responseDeadlineState: "within_deadline",
      isEscalationReady: false
    },
    media: {
      id: "media-utf8",
      alarmCaseId: "alarm-utf8",
      mediaKind: "snapshot",
      storageKey: "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20120%2040%22%3E%3Ctext%20x%3D%2210%22%20y%3D%2225%22%3EMEDIA%20DEMO%3C/text%3E%3C/svg%3E",
      mimeType: "image/svg+xml",
      isPrimary: true,
      createdAt: "2026-04-12T18:00:01.000Z"
    },
    siteName: "Standort Nord",
    customerName: "Pilotkunde"
  }, "inline", "active");

  assert.equal(document.sourceKind, "embedded");
  assert.equal(document.mimeType, "image/svg+xml");
  assert.match(Buffer.from(document.contentBase64, "base64").toString("utf-8"), /MEDIA DEMO/);
});

test("media access reference preview tolerates date objects in context values", () => {
  const document = createMediaAccessDocument({
    alarmCase: {
      id: "alarm-ref",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "received",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Referenz Alarm",
      receivedAt: "2026-04-12T18:00:00.000Z",
      lastEventAt: "2026-04-12T18:00:00.000Z",
      createdAt: "2026-04-12T18:00:00.000Z",
      updatedAt: "2026-04-12T18:00:00.000Z",
      responseDeadlineState: "within_deadline",
      isEscalationReady: false
    },
    media: {
      id: "media-ref",
      alarmCaseId: "alarm-ref",
      mediaKind: "clip",
      storageKey: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      mimeType: "video/mp4",
      isPrimary: false,
      capturedAt: new Date("2026-04-12T18:00:01.000Z") as unknown as string,
      createdAt: "2026-04-12T18:00:01.000Z"
    },
    siteName: "Standort Nord",
    customerName: "Pilotkunde"
  }, "inline", "active");

  assert.equal(document.sourceKind, "reference_preview");
  assert.match(Buffer.from(document.contentBase64, "base64").toString("utf-8"), /flower\.mp4/);
});
