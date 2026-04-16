/**
 * Testet Aliasregeln und Normalisierungen der vendor-spezifischen Profile.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVendorEventType } from "../modules/alarm-core/vendor-profiles.js";

test("vendor profiles normalize dahua aliases into canonical event types", () => {
  assert.equal(normalizeVendorEventType("dahua", "nvr", "CrossLineDetection"), "line_crossing");
  assert.equal(normalizeVendorEventType("dahua", "nvr", "IPCOffline"), "camera_offline");
  assert.equal(normalizeVendorEventType("dahua", "nvr", "RecorderOffline"), "nvr_offline");
});

test("vendor profiles normalize hikvision aliases into canonical event types", () => {
  assert.equal(normalizeVendorEventType("hikvision", "camera", "lineDetectionStart"), "line_crossing");
  assert.equal(normalizeVendorEventType("hikvision", "camera", "networkDisconnected"), "camera_offline");
  assert.equal(normalizeVendorEventType("hikvision", "nvr", "hdError"), "technical");
  assert.equal(normalizeVendorEventType("hikvision", "nvr", "ipcDisconnect"), "camera_offline");
});