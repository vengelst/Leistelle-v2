/**
 * Testet das Parsen vendor-spezifischer Mediennamen und Medienhinweise.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDahuaMediaFilename,
  parseGroundigMediaFilename,
  parseGroundigMediaPath,
  parseHikvisionMediaFilename,
  parseVendorMediaFilename
} from "../modules/alarm-core/vendor-media-parser.js";

test("parseGroundigMediaFilename parses full filename with vendor event id", () => {
  const result = parseGroundigMediaFilename("camera", "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_001.jpg");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.sourceId, "GR_CAM_014");
  assert.equal(result.parsed?.channelId, "CH01");
  assert.equal(result.parsed?.eventType, "motion");
  assert.equal(result.parsed?.eventTs, "2026-04-11T14:33:21.000Z");
  assert.equal(result.parsed?.vendorEventId, "EVT88442191");
  assert.equal(result.parsed?.mediaType, "image");
  assert.equal(result.parsed?.sequenceNo, 1);
});

test("parseGroundigMediaFilename parses fallback filename without vendor event id", () => {
  const result = parseGroundigMediaFilename("camera", "GR_CAM_014__CH01__intrusion__20260411T143321Z__img_002.jpg");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.vendorEventId, undefined);
  assert.equal(result.parsed?.eventType, "area_entry");
  assert.equal(result.parsed?.sequenceNo, 2);
});

test("parseGroundigMediaFilename parses clip file", () => {
  const result = parseGroundigMediaFilename("camera", "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__clip.mp4");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.mediaKind, "clip");
  assert.equal(result.parsed?.mediaType, "clip");
});

test("parseGroundigMediaFilename rejects invalid filename", () => {
  const result = parseGroundigMediaFilename("camera", "invalid-groundig-file.jpg");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /unsupported grundig media filename/i);
});

test("parseGroundigMediaPath extracts filename from path", () => {
  const result = parseGroundigMediaPath("camera", "/incoming/grundig/GR_CAM_014__CH01__motion__20260411T143321Z__clip.mp4");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.relativePath, "/incoming/grundig/GR_CAM_014__CH01__motion__20260411T143321Z__clip.mp4");
});

test("parseVendorMediaFilename rejects unknown vendor", () => {
  const result = parseVendorMediaFilename("unknown", "camera", "file.jpg");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /no media filename parser is registered/i);
});

test("parseDahuaMediaFilename parses structured filename", () => {
  const result = parseDahuaMediaFilename("nvr", "DH_NVR_01__CH03__CrossLineDetection__20260411T143321Z__DAHUA884__img_001.jpg");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.vendor, "dahua");
  assert.equal(result.parsed?.sourceType, "nvr");
  assert.equal(result.parsed?.externalRecorderId, "DH_NVR_01");
  assert.equal(result.parsed?.channelNumber, 3);
  assert.equal(result.parsed?.eventType, "line_crossing");
  assert.equal(result.parsed?.vendorEventId, "DAHUA884");
});

test("parseDahuaMediaFilename parses legacy underscore filename", () => {
  const result = parseDahuaMediaFilename("nvr", "DH_NVR_01_CH03_VideoMotion_20260411T143321_DAHUA885_002.jpg");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.sourceId, "DH_NVR_01");
  assert.equal(result.parsed?.channelId, "CH03");
  assert.equal(result.parsed?.eventType, "motion");
  assert.equal(result.parsed?.sequenceNo, 2);
});

test("parseHikvisionMediaFilename parses structured filename", () => {
  const result = parseHikvisionMediaFilename("camera", "HIK_CAM_014__CH01__lineDetectionStart__20260411T143321Z__HIK991__img_001.jpg");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.vendor, "hikvision");
  assert.equal(result.parsed?.externalDeviceId, "HIK_CAM_014");
  assert.equal(result.parsed?.eventType, "line_crossing");
  assert.equal(result.parsed?.channelNumber, 1);
});

test("parseHikvisionMediaFilename parses legacy underscore clip filename", () => {
  const result = parseHikvisionMediaFilename("nvr", "HIK_NVR_01_CH04_ipcDisconnect_20260411143321_HIK992_clip.mp4");
  assert.equal(result.ok, true);
  assert.equal(result.parsed?.sourceType, "nvr");
  assert.equal(result.parsed?.eventType, "camera_offline");
  assert.equal(result.parsed?.mediaKind, "clip");
  assert.equal(result.parsed?.channelId, "CH04");
});