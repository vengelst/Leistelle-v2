/**
 * Verifiziert die CSV-Erzeugung fuer Archiv- und Reporting-Exporte.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AlarmArchiveResult, ReportingOverview } from "@leitstelle/contracts";

import { buildArchiveExportCsv, buildReportingExportCsv } from "../archive-reporting-export.js";

test("archive export csv includes header and archived case rows", () => {
  const csv = buildArchiveExportCsv({
    items: [
      {
        id: "alarm-1",
        siteId: "site-1",
        primaryDeviceId: "device-1",
        title: "Toralarm Nord",
        priority: "high",
        priorityRank: 3,
        lifecycleStatus: "archived",
        assessmentStatus: "confirmed_incident",
        technicalState: "complete",
        alarmType: "motion",
        customerName: "Customer Nord",
        siteName: "Standort Nord",
        primaryDeviceName: "Kamera 1",
        receivedAt: "2026-04-10T08:00:00.000Z",
        firstOpenedAt: "2026-04-10T08:01:00.000Z",
        resolvedAt: "2026-04-10T08:15:00.000Z",
        archivedAt: "2026-04-10T08:20:00.000Z",
        closureReasonId: "closure-1",
        closedByUserId: "user-1",
        archivedByUserId: "user-2",
        lastEventAt: "2026-04-10T08:20:00.000Z",
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T08:20:00.000Z",
        closureReasonLabel: "Massnahme abgeschlossen",
        closedByDisplayName: "Operator Eins",
        archivedByDisplayName: "Leitung",
        eventCount: 7,
        mediaCount: 2
      }
    ] as AlarmArchiveResult["items"],
    filters: {
      period: "week",
      lifecycleScope: "archived"
    }
  });

  assert.match(csv, /^id;titel;prioritaet;/);
  assert.match(csv, /alarm-1;Toralarm Nord;high;archived;confirmed_incident;motion;/);
  assert.match(csv, /Massnahme abgeschlossen;Operator Eins;Leitung;7;2/);
});

test("reporting export csv contains meta, count, duration and group rows", () => {
  const csv = buildReportingExportCsv({
    filter: {
      period: "month",
      siteId: "site-1",
      groupBy: "site"
    },
    range: {
      period: "month",
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.999Z",
      label: "01.04.2026 bis 30.04.2026"
    },
    alarms: {
      counts: {
        totalAlarms: { value: 12, label: "Alle Alarme" },
        confirmedIncidents: { value: 3, label: "Echtalarme" },
        falsePositives: { value: 2, label: "Fehlalarme" },
        policeCalls: { value: 1, label: "Polizeieinsaetze" },
        securityServiceCalls: { value: 1, label: "Sicherheitsdiensteinsaetze" },
        customerContacts: { value: 4, label: "Kundenkontakte" }
      },
      durations: {
        timeToAcceptance: { label: "Zeit bis Alarmannahme", sampleCount: 12, averageSeconds: 18, maximumSeconds: 40, totalSeconds: 216 },
        timeToProcessingStart: { label: "Zeit bis Bearbeitungsbeginn", sampleCount: 10, averageSeconds: 45, maximumSeconds: 120, totalSeconds: 450 },
        timeToClosure: { label: "Zeit bis Abschluss", sampleCount: 8, averageSeconds: 300, maximumSeconds: 900, totalSeconds: 2400 },
        openAlarmDuration: { label: "Dauer offener Alarme", sampleCount: 2, averageSeconds: 1800, maximumSeconds: 2400, totalSeconds: 3600 }
      },
      groups: [
        { key: "site-1", label: "Standort Nord", value: 12, hint: "Alle Faelle am Standort" }
      ]
    },
    monitoring: {
      counts: {
        totalDisturbances: { value: 5, label: "Technische Stoerungen" },
        openCriticalDisturbances: { value: 1, label: "Offene kritische Stoerungen" }
      },
      durations: {
        openDisturbanceDuration: { label: "Dauer offener Stoerungen", sampleCount: 1, averageSeconds: 600, maximumSeconds: 600, totalSeconds: 600 }
      },
      groups: [
        { key: "site-1", label: "Standort Nord", value: 5 }
      ]
    }
  } satisfies ReportingOverview);

  assert.match(csv, /^bereich;typ;schluessel;label;wert;/);
  assert.match(csv, /meta;zeitraum;month;01\.04\.2026 bis 30\.04\.2026/);
  assert.match(csv, /meta;filter;siteId;siteId;site-1/);
  assert.match(csv, /alarm;count;totalAlarms;Alle Alarme;12/);
  assert.match(csv, /alarm;duration;timeToClosure;Zeit bis Abschluss;;8;300;900;2400/);
  assert.match(csv, /monitoring;group;site-1;Standort Nord;5/);
});

test("archive export csv stays stable for empty result sets", () => {
  const csv = buildArchiveExportCsv({
    items: [],
    filters: {
      period: "day"
    }
  });

  assert.equal(csv.split("\n").length, 1);
  assert.match(csv, /^id;titel;prioritaet;/);
});
