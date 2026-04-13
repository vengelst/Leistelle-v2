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
