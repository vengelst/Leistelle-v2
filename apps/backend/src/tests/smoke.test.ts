import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

import type { BackendRuntimeConfig } from "../config/runtime.js";
import { createApp } from "../app.js";
import { createDatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrator.js";
import { resetDatabase } from "../db/reset.js";
import { seedDatabase } from "../db/seed.js";
import { createMonitoringScanService, createMonitoringStore } from "../modules/monitoring/index.js";

const testConfig: BackendRuntimeConfig = {
  serviceName: "backend",
  version: "smoke-test",
  environment: "test",
  http: {
    host: "127.0.0.1",
    port: 0,
    trustProxy: false
  },
  auth: {
    sessionTtlHours: 8,
    bootstrapPassword: process.env.AUTH_BOOTSTRAP_PASSWORD ?? "Leitstelle!2026"
  },
  database: {
    url: process.env.DATABASE_URL ?? "postgres://leitstelle:leitstelle@127.0.0.1:55440/leitstelle"
  },
  cors: {
    origin: "http://127.0.0.1:4173"
  },
  mediaStorage: {
    type: "reference"
  },
  alarmAssignment: {
    autoAssignLightEnabled: false
  },
  externalAlarmIngestion: {
  },
  externalMediaIngestion: {
    correlationToleranceSeconds: 30,
    vendorCorrelationToleranceSeconds: {}
  }
};

let server: Server;
let baseUrl = "";
let appInstance: Awaited<ReturnType<typeof createApp>>;

before(async () => {
  const database = createDatabaseClient(testConfig);
  await runMigrations(database);
  await resetDatabase(database);
  await seedDatabase(database, testConfig.auth.bootstrapPassword);
  await database.close();

  appInstance = await createApp(testConfig);
  server = createServer((req, res) => {
    void appInstance.handle(req, res);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Smoke test server address is unavailable.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server?.close();
  if (appInstance) {
    await appInstance.close();
  }
});

test("smoke flow covers auth, customer/site/device persistence, validation and audit", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.data.session.user.primaryRole, "administrator");
  assert.deepEqual(loginResponse.body.data.session.user.roles, ["administrator", "leitstellenleiter"]);

  const token = loginResponse.body.data.session.token as string;

  const pauseResponse = await apiRequest("/api/v1/auth/status/pause", {
    method: "POST",
    token,
    body: {
      reason: "Kurzpause"
    }
  });
  assert.equal(pauseResponse.status, 200);
  assert.equal(pauseResponse.body.data.user.status, "in_pause");

  const sessionResponse = await apiRequest("/api/v1/auth/session", {
    method: "GET",
    token
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.body.data.session.user.status, "in_pause");
  assert.deepEqual(sessionResponse.body.data.session.user.roles, ["administrator", "leitstellenleiter"]);

  const customerResponse = await apiRequest("/api/v1/master-data/customers", {
    method: "POST",
    token,
    body: {
      name: "Testkunde Nord",
      externalRef: "CUST-200",
      isActive: true
    }
  });
  assert.equal(customerResponse.status, 200);
  const customer = customerResponse.body.data.overview.customers.find((entry: { name: string }) => entry.name === "Testkunde Nord");
  assert.ok(customer);

  const siteResponse = await apiRequest("/api/v1/master-data/sites", {
    method: "POST",
    token,
    body: {
      customerId: customer.id,
      siteName: "Teststandort Berlin",
      status: "active",
      street: "Teststrasse 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      latitude: 52.520008,
      longitude: 13.404954,
      isArchived: false,
      monitoringIntervalSeconds: 180,
      failureThreshold: 2,
      highlightCriticalDevices: true,
      defaultAlarmPriority: "high",
      defaultWorkflowProfile: "event_sensitive",
      mapLabelMode: "full"
    }
  });
  assert.equal(siteResponse.status, 200);
  const site = siteResponse.body.data.overview.sites.find((entry: { siteName: string }) => entry.siteName === "Teststandort Berlin");
  assert.ok(site);
  assert.equal(site.customer.id, customer.id);
  assert.equal(site.coordinates.latitude, 52.520008);
  assert.equal(site.coordinates.longitude, 13.404954);

  const deviceResponse = await apiRequest("/api/v1/master-data/devices", {
    method: "POST",
    token,
    body: {
      siteId: site.id,
      name: "Test Router Berlin",
      type: "router",
      vendor: "Lancom",
      model: "1900EF",
      serialNumber: "SER-200",
      status: "installed",
      isActive: true,
      networkAddress: "10.0.0.10"
    }
  });
  assert.equal(deviceResponse.status, 200);
  const updatedSite = deviceResponse.body.data.overview.sites.find((entry: { id: string }) => entry.id === site.id);
  assert.ok(updatedSite.devices.some((entry: { name: string }) => entry.name === "Test Router Berlin"));

  const invalidResponse = await apiRequest("/api/v1/master-data/sites", {
    method: "POST",
    token,
    body: {
      customerId: customer.id,
      siteName: "Fehlerstandort",
      status: "active",
      street: "Teststrasse 2",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      latitude: 52.5,
      longitude: 13.4,
      isArchived: false,
      monitoringIntervalSeconds: 0,
      failureThreshold: 2,
      highlightCriticalDevices: true,
      defaultAlarmPriority: "high",
      defaultWorkflowProfile: "event_sensitive",
      mapLabelMode: "full"
    }
  });
  assert.equal(invalidResponse.status, 400);
  assert.match(invalidResponse.body.detail, /monitoringIntervalSeconds/i);

  const auditDatabase = createDatabaseClient(testConfig);
  const auditEvents = await auditDatabase.query<{ total: string }>("select count(*)::text as total from audit_events");
  await auditDatabase.close();
  assert.ok(Number(auditEvents.rows[0]?.total ?? "0") >= 5);
});

test("smoke flow covers user administration CRUD, role updates and deactivate/reactivate", async () => {
  const adminLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.data.session.token as string;

  const initialOverview = await apiRequest("/api/v1/admin/users/overview", {
    method: "GET",
    token: adminToken
  });
  assert.equal(initialOverview.status, 200);
  assert.ok(initialOverview.body.data.overview.users.some((user: { username: string }) => user.username === "admin"));

  const createResponse = await apiRequest("/api/v1/admin/users", {
    method: "POST",
    token: adminToken,
    body: {
      displayName: "Dispatcher Nord",
      username: "dispatcher",
      email: "dispatcher@leitstelle.local",
      primaryRole: "operator",
      roles: ["operator"],
      isActive: true,
      password: "Dispatch!2026"
    }
  });
  assert.equal(createResponse.status, 200);

  const createdUser = createResponse.body.data.overview.users.find((user: { username: string }) => user.username === "dispatcher");
  assert.ok(createdUser);
  assert.equal(createdUser.displayName, "Dispatcher Nord");
  assert.equal(createdUser.isActive, true);

  const operatorLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLogin.status, 200);
  const operatorToken = operatorLogin.body.data.session.token as string;
  const forbiddenOverview = await apiRequest("/api/v1/admin/users/overview", {
    method: "GET",
    token: operatorToken
  });
  assert.equal(forbiddenOverview.status, 403);

  const updateResponse = await apiRequest("/api/v1/admin/users", {
    method: "POST",
    token: adminToken,
    body: {
      id: createdUser.id,
      displayName: "Dispatcher Nord Updated",
      username: "dispatcher",
      email: "dispatcher@leitstelle.local",
      primaryRole: "operator",
      roles: ["operator", "service"],
      isActive: true
    }
  });
  assert.equal(updateResponse.status, 200);
  const updatedUser = updateResponse.body.data.overview.users.find((user: { id: string }) => user.id === createdUser.id);
  assert.ok(updatedUser);
  assert.deepEqual(updatedUser.roles, ["operator", "service"]);

  const deactivateResponse = await apiRequest(`/api/v1/admin/users/${createdUser.id}/activation`, {
    method: "POST",
    token: adminToken,
    body: {
      isActive: false
    }
  });
  assert.equal(deactivateResponse.status, 200);
  const deactivatedUser = deactivateResponse.body.data.overview.users.find((user: { id: string }) => user.id === createdUser.id);
  assert.ok(deactivatedUser);
  assert.equal(deactivatedUser.isActive, false);
  assert.equal(deactivatedUser.status, "offline");

  const inactiveLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "dispatcher",
      password: "Dispatch!2026"
    }
  });
  assert.equal(inactiveLogin.status, 403);
  assert.equal(inactiveLogin.body.code, "AUTH_USER_INACTIVE");

  const reactivateResponse = await apiRequest(`/api/v1/admin/users/${createdUser.id}/activation`, {
    method: "POST",
    token: adminToken,
    body: {
      isActive: true
    }
  });
  assert.equal(reactivateResponse.status, 200);
  const reactivatedUser = reactivateResponse.body.data.overview.users.find((user: { id: string }) => user.id === createdUser.id);
  assert.ok(reactivatedUser);
  assert.equal(reactivatedUser.isActive, true);

  const loginAfterReactivate = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "dispatcher",
      password: "Dispatch!2026"
    }
  });
  assert.equal(loginAfterReactivate.status, 200);
});

test("smoke flow covers alarm ingestion for full, incomplete, unknown and invalid payloads", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });
  const token = loginResponse.body.data.session.token as string;

  const completeResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      primaryDeviceId: "device-camera-yard-1",
      externalSourceRef: "SRC-100",
      alarmType: "intrusion",
      priority: "critical",
      title: "Fence intrusion north",
      description: "Motion alarm from yard camera",
      sourceOccurredAt: "2026-04-09T20:00:00.000Z",
      sourcePayload: {
        sourceSystem: "edge-gateway",
        severity: "critical"
      },
      media: [
        {
          deviceId: "device-camera-yard-1",
          mediaKind: "snapshot",
          storageKey: "alarms/2026/04/09/snapshot-1.jpg",
          mimeType: "image/jpeg",
          capturedAt: "2026-04-09T20:00:01.000Z",
          isPrimary: true
        }
      ]
    }
  });
  assert.equal(completeResponse.status, 200);
  assert.equal(completeResponse.body.data.acceptedAsTechnicalError, false);
  assert.equal(completeResponse.body.data.alarmCase.alarmType, "motion");
  assert.equal(completeResponse.body.data.alarmCase.priority, "critical");
  assert.equal(completeResponse.body.data.alarmCase.technicalState, "complete");
  assert.equal(completeResponse.body.data.media.length, 1);
  assert.ok(completeResponse.body.data.events.some((entry: { eventKind: string }) => entry.eventKind === "media_attached"));

  const incompleteResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      alarmType: "offline",
      description: "Heartbeat missing"
    }
  });
  assert.equal(incompleteResponse.status, 200);
  assert.equal(incompleteResponse.body.data.acceptedAsTechnicalError, true);
  assert.equal(incompleteResponse.body.data.alarmCase.technicalState, "incomplete");
  assert.equal(incompleteResponse.body.data.alarmCase.alarmType, "technical");
  assert.equal(incompleteResponse.body.data.alarmCase.assessmentStatus, "pending");
  assert.match(incompleteResponse.body.data.alarmCase.incompleteReason, /primary_device_missing/);

  const unknownTypeResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      primaryDeviceId: "device-camera-yard-1",
      alarmType: "custom_vendor_alarm",
      title: "Unknown source alarm"
    }
  });
  assert.equal(unknownTypeResponse.status, 200);
  assert.equal(unknownTypeResponse.body.data.alarmCase.alarmType, "other_disturbance");
  assert.equal(unknownTypeResponse.body.data.acceptedAsTechnicalError, true);

  const invalidPayloadResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "",
      media: [
        {
          mediaKind: "snapshot"
        }
      ]
    }
  });
  assert.equal(invalidPayloadResponse.status, 400);
  assert.match(invalidPayloadResponse.body.detail, /siteId|storageKey/i);

  const pipelineResponse = await apiRequest("/api/v1/alarm-cases/open", {
    method: "GET",
    token
  });
  assert.equal(pipelineResponse.status, 200);
  assert.ok(Array.isArray(pipelineResponse.body.data.items));
  assert.ok(pipelineResponse.body.data.items.length >= 3);
  assert.equal(pipelineResponse.body.data.items[0].priority, "critical");
  assert.ok(pipelineResponse.body.data.items.some((entry: { technicalState: string }) => entry.technicalState === "incomplete"));
  assert.ok(
    pipelineResponse.body.data.items.every((entry: { responseDueAt?: string; responseDeadlineState: string; isEscalationReady: boolean }) =>
      typeof entry.responseDueAt === "string"
      && ["within_deadline", "due_soon", "overdue", "met"].includes(entry.responseDeadlineState)
      && typeof entry.isEscalationReady === "boolean"
    )
  );

  const technicalOnlyResponse = await apiRequest("/api/v1/alarm-cases/open?technicalState=incomplete", {
    method: "GET",
    token
  });
  assert.equal(technicalOnlyResponse.status, 200);
  assert.ok(
    technicalOnlyResponse.body.data.items.every((entry: { technicalState: string; hasTechnicalIssue: boolean }) =>
      entry.technicalState === "incomplete" && entry.hasTechnicalIssue
    )
  );

  const database = createDatabaseClient(testConfig);
  const caseCount = await database.query<{ total: string }>("select count(*)::text as total from alarm_cases");
  const eventCount = await database.query<{ total: string }>("select count(*)::text as total from alarm_events");
  const mediaCount = await database.query<{ total: string }>("select count(*)::text as total from alarm_media");
  const technicalCaseCount = await database.query<{ total: string }>(
    "select count(*)::text as total from alarm_cases where technical_state = 'incomplete'"
  );
  await database.close();

  assert.ok(Number(caseCount.rows[0]?.total ?? "0") >= 3);
  assert.ok(Number(eventCount.rows[0]?.total ?? "0") >= 4);
  assert.ok(Number(mediaCount.rows[0]?.total ?? "0") >= 1);
  assert.ok(Number(technicalCaseCount.rows[0]?.total ?? "0") >= 2);
});

test("smoke flow covers external alarm ingestion mapping duplicate handling and guarded access", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceSystem: "dahua",
          sourceType: "nvr",
          externalEventId: "DAHUA-EVT-100",
          deviceSerialNumber: "AX-1468-001",
          eventType: "intrusion",
          eventTime: "2026-04-10T12:15:00.000Z",
          severity: "major",
          cameraName: "Yard Kamera 1",
          zone: "north-fence",
          rawPayload: {
            channelId: 1,
            eventCode: "IVS"
          },
          media: [
            {
              deviceNetworkAddress: "10.12.0.21",
              storageKey: "https://example.test/external-snapshot-1.jpg",
              mediaKind: "snapshot",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T12:15:01.000Z",
              isPrimary: true
            }
          ]
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.resolution.siteId, "site-hamburg-hafen");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "dahua:nvr:DAHUA-EVT-100");
      assert.equal(acceptedResponse.body.data.media.length, 1);
      assert.ok(
        acceptedResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated" && entry.payload?.externalEventId === "DAHUA-EVT-100"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceSystem: "dahua",
          sourceType: "nvr",
          externalEventId: "DAHUA-EVT-100",
          deviceSerialNumber: "AX-1468-001",
          eventType: "intrusion",
          eventTime: "2026-04-10T12:15:00.000Z"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.siteId, "site-hamburg-hafen");
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.media.length, 1);
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "dahua");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated" && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceSystem: "dahua",
          sourceType: "nvr",
          externalEventId: "DAHUA-EVT-101",
          deviceSerialNumber: "UNKNOWN-SERIAL",
          eventType: "intrusion",
          eventTime: "2026-04-10T12:20:00.000Z"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");

      const wrongSecretResponse = await request("/api/v1/alarm-ingestion/external", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "wrong-secret"
        },
        body: {
          sourceSystem: "dahua",
          sourceType: "nvr",
          externalEventId: "DAHUA-EVT-102",
          deviceSerialNumber: "AX-1468-001",
          eventType: "intrusion",
          eventTime: "2026-04-10T12:25:00.000Z"
        }
      });
      assert.equal(wrongSecretResponse.status, 403);
      assert.equal(wrongSecretResponse.body.code, "ALARM_EXTERNAL_INGESTION_KEY_INVALID");
    }
  );
});

test("smoke flow covers alarm follow-up set, visibility and removal", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const pipelineResponse = await apiRequest("/api/v1/alarm-cases/open", {
    method: "GET",
    token
  });
  assert.equal(pipelineResponse.status, 200);
  const alarmCaseId = pipelineResponse.body.data.items[0]?.id as string | undefined;
  assert.ok(alarmCaseId);

  const futureFollowUpAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const setResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/follow-up`, {
    method: "POST",
    token,
    body: {
      followUpAt: futureFollowUpAt,
      note: "Rueckruf mit Leitstelle pruefen"
    }
  });
  assert.equal(setResponse.status, 200);
  assert.equal(setResponse.body.data.alarmCase.followUpAt, futureFollowUpAt);
  assert.equal(setResponse.body.data.alarmCase.followUpNote, "Rueckruf mit Leitstelle pruefen");

  const detailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}`, {
    method: "GET",
    token
  });
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.data.alarmCase.followUpAt, futureFollowUpAt);
  assert.equal(detailResponse.body.data.alarmCase.followUpNote, "Rueckruf mit Leitstelle pruefen");
  assert.ok(detailResponse.body.data.events.some((event: { eventKind: string }) => event.eventKind === "follow_up_updated"));

  const refreshedPipeline = await apiRequest("/api/v1/alarm-cases/open", {
    method: "GET",
    token
  });
  const followedItem = refreshedPipeline.body.data.items.find((entry: { id: string }) => entry.id === alarmCaseId);
  assert.equal(followedItem.followUpAt, futureFollowUpAt);

  const pastResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/follow-up`, {
    method: "POST",
    token,
    body: {
      followUpAt: "2020-01-01T00:00:00.000Z"
    }
  });
  assert.equal(pastResponse.status, 400);

  const clearResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/follow-up`, {
    method: "POST",
    token,
    body: {
      clear: true
    }
  });
  assert.equal(clearResponse.status, 200);
  assert.equal(clearResponse.body.data.alarmCase.followUpAt, undefined);

  const clearedDetail = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}`, {
    method: "GET",
    token
  });
  assert.equal(clearedDetail.status, 200);
  assert.equal(clearedDetail.body.data.alarmCase.followUpAt, undefined);
  assert.ok(clearedDetail.body.data.events.some((event: { eventKind: string }) => event.eventKind === "follow_up_cleared"));
});

test("smoke flow covers dahua nvr adapter endpoint normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/dahua/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "DAHUA-NVR-200",
          eventCode: "CrossLineDetection",
          eventTime: "2026-04-10T12:30:00.000Z",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          cameraName: "Yard Kamera 1",
          channel: 1,
          severity: "2",
          zone: "north-fence",
          ruleName: "Zaun Nord",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/dahua-nvr-snapshot-1.jpg",
              mimeType: "image/jpeg",
              cameraIp: "10.12.0.21",
              capturedAt: "2026-04-10T12:30:01.000Z"
            }
          ],
          rawPayload: {
            code: "CrossLineDetection",
            rule: "Zaun Nord"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "line_crossing");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "dahua:nvr:DAHUA-NVR-200");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 1);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.zone, "north-fence");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "dahua-nvr");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceType === "nvr"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/dahua/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "DAHUA-NVR-200",
          eventCode: "CrossLineDetection",
          eventTime: "2026-04-10T12:30:00.000Z",
          recorderSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/dahua/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T12:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/dahua/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "DAHUA-NVR-201",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T12:40:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers grundig gu-rn-ac5104n adapter endpoint normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-NVR-300",
          eventCode: "PID",
          eventTime: "2026-04-10T13:30:00.000Z",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          cameraName: "Yard Kamera 1",
          channel: 1,
          severity: "major",
          zone: "north-fence",
          ruleName: "Perimeter Nord",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/grundig-snapshot-1.jpg",
              mimeType: "image/jpeg",
              cameraIp: "10.12.0.21",
              capturedAt: "2026-04-10T13:30:01.000Z"
            }
          ],
          rawPayload: {
            code: "PID",
            rule: "Perimeter Nord"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "area_entry");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "critical");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "grundig:nvr:GRUNDIG-NVR-300");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 1);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.zone, "north-fence");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "grundig-gu-rn-ac5104n");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "grundig"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-NVR-300",
          eventCode: "PID",
          eventTime: "2026-04-10T13:30:00.000Z",
          recorderSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T13:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-NVR-301",
          eventCode: "Motion",
          eventTime: "2026-04-10T13:40:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers ajax hub 2 (4g) jeweller adapter endpoint normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-HUB-400",
          hubId: "hub-nord-1",
          hubName: "Objekt Nord",
          hubExternalId: "ajax-cloud-hub-1",
          eventType: "intrusion_alarm",
          eventSubType: "motion",
          eventTime: "2026-04-10T14:30:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "device-camera-yard-1",
          detectorId: "detector-motion-flur",
          deviceName: "MotionProtect Flur",
          room: "Flur",
          group: "EG",
          partition: "Objekt Nord",
          user: "Leitstelle Nord",
          triggerSource: "detector",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/ajax-photo-1.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T14:30:02.000Z",
              metadata: {
                photoSeries: 1
              }
            }
          ],
          rawPayload: {
            cloudEventId: "cloud-evt-1"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "motion");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "ajax:hub:AJAX-HUB-400");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 1);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "ajax");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "ajax-hub-2-4g-jeweller");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "ajax"
          && entry.payload?.cameraName === "MotionProtect Flur"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-HUB-400",
          eventType: "intrusion_alarm",
          eventTime: "2026-04-10T14:30:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "device-camera-yard-1"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T14:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventType/i);

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-HUB-401",
          eventType: "intrusion_alarm",
          eventTime: "2026-04-10T14:40:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "unknown-device"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_NOT_FOUND");
    }
  );
});

test("smoke flow covers ajax cloud cms collector stub delegation duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/ajax/cloud-cms-stub", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-COLLECTOR-500",
          collectorSource: "cms",
          hubId: "hub-nord-1",
          hubName: "Objekt Nord",
          hubExternalId: "ajax-cms-hub-1",
          eventType: "intrusion_alarm",
          eventSubType: "motion",
          occurredAt: "2026-04-10T15:30:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "device-camera-yard-1",
          detectorId: "detector-motion-flur",
          deviceName: "MotionProtect Flur",
          room: "Flur",
          group: "EG",
          partition: "Objekt Nord",
          user: "Leitstelle Nord",
          triggerSource: "cms-operator",
          media: [
            {
              mediaType: "snapshot",
              uri: "https://example.test/ajax-cms-photo-1.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T15:30:01.000Z"
            }
          ],
          rawPayload: {
            upstreamCollectorEventId: "collector-event-1"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "motion");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "ajax:hub:AJAX-COLLECTOR-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 1);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "ajax");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "ajax-hub-2-4g-jeweller");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.collectorStub, "ajax-cloud-cms");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.collectorSource, "cms");
      assert.equal(
        detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.upstreamPayload.upstreamCollectorEventId,
        "collector-event-1"
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/ajax/cloud-cms-stub", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-COLLECTOR-500",
          eventType: "intrusion_alarm",
          occurredAt: "2026-04-10T15:30:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "device-camera-yard-1"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/ajax/cloud-cms-stub", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          occurredAt: "2026-04-10T15:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventType/i);

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/ajax/cloud-cms-stub", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-COLLECTOR-501",
          eventType: "intrusion_alarm",
          occurredAt: "2026-04-10T15:40:00.000Z",
          siteId: "site-hamburg-hafen",
          deviceId: "unknown-device"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_NOT_FOUND");
    }
  );
});

test("smoke flow covers ajax nvr 8ch adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/ajax/nvr-8ch", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-NVR-500",
          eventCode: "Motion",
          eventType: "video_motion",
          eventTime: "2026-04-10T16:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-01",
          nvrId: "ajax-nvr-hafen-1",
          nvrName: "Ajax Hafen Recorder",
          nvrSerialNumber: "NVR-820-001",
          nvrIp: "10.12.0.10",
          cameraId: "cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          channel: 1,
          severity: "warning",
          zone: "yard-north",
          ruleName: "Motion North",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/ajax-nvr-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T16:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "archive_reference",
              url: "https://example.test/ajax-nvr/archive/segment-1",
              metadata: {
                archiveSegment: "segment-1"
              }
            }
          ],
          rawPayload: {
            upstreamSystem: "ajax-video"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "motion");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "ajax:nvr:AJAX-NVR-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "ajax");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "nvr");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "ajax-nvr-8ch");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.upstreamSystem, "ajax-video");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "ajax"
          && entry.payload?.sourceType === "nvr"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/ajax/nvr-8ch", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-NVR-500",
          eventCode: "Motion",
          eventTime: "2026-04-10T16:30:00.000Z",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/ajax/nvr-8ch", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T16:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/ajax/nvr-8ch", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-NVR-501",
          eventCode: "VideoLoss",
          eventTime: "2026-04-10T16:40:00.000Z",
          siteId: "site-unknown",
          nvrSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/ajax/nvr-8ch", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AJAX-NVR-502",
          eventCode: "Motion",
          eventTime: "2026-04-10T16:45:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers grundig gu series ip camera adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-CAM-500",
          eventCode: "LineCrossingDetection",
          eventType: "line_crossing",
          eventTime: "2026-04-10T17:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-CAM-01",
          cameraId: "grundig-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          analyticsName: "Line Crossing",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/grundig-camera-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T17:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/grundig-camera-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "camera-http"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "line_crossing");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "grundig:camera:GRUNDIG-CAM-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "grundig");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "grundig-gu-series-ip-camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-CAM-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "camera-http");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "grundig"
          && entry.payload?.sourceType === "camera"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-CAM-500",
          eventCode: "LineCrossingDetection",
          eventTime: "2026-04-10T17:30:00.000Z",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T17:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-CAM-501",
          eventCode: "VideoLoss",
          eventTime: "2026-04-10T17:40:00.000Z",
          siteId: "site-unknown",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "GRUNDIG-CAM-502",
          eventCode: "Motion",
          eventTime: "2026-04-10T17:45:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers hikvision ip camera adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/hikvision/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-CAM-500",
          eventCode: "linedetection",
          eventType: "lineDetectionStart",
          eventTime: "2026-04-10T18:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-HIK-01",
          cameraId: "hik-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          analyticsName: "Line Detection",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/hikvision-camera-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T18:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/hikvision-camera-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "isapi-alertstream"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "line_crossing");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "hikvision:camera:HIK-CAM-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "hikvision");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "hikvision-ip-camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-HIK-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "isapi-alertstream");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "hikvision"
          && entry.payload?.sourceType === "camera"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/hikvision/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-CAM-500",
          eventCode: "linedetection",
          eventTime: "2026-04-10T18:30:00.000Z",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/hikvision/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T18:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/hikvision/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-CAM-501",
          eventCode: "videoloss",
          eventTime: "2026-04-10T18:40:00.000Z",
          siteId: "site-unknown",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/hikvision/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-CAM-502",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T18:45:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers axis ip camera adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/axis/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-CAM-500",
          eventCode: "LineTouched",
          eventType: "CrossLineDetection",
          eventTime: "2026-04-10T20:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-AXIS-01",
          cameraId: "axis-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          analyticsName: "CrossLineDetection",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/axis-camera-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T20:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/axis-camera-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "vapix-event-stream"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "line_crossing");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "axis:camera:AXIS-CAM-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "axis");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "axis-ip-camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-AXIS-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "vapix-event-stream");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "axis"
          && entry.payload?.sourceType === "camera"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/axis/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-CAM-500",
          eventCode: "LineTouched",
          eventTime: "2026-04-10T20:30:00.000Z",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/axis/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T20:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/axis/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-CAM-501",
          eventCode: "VideoLoss",
          eventTime: "2026-04-10T20:40:00.000Z",
          siteId: "site-unknown",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/axis/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-CAM-502",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T20:45:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers uniview ip camera adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/uniview/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "UNV-CAM-500",
          eventCode: "CrossLineDetection",
          eventType: "LineCrossing",
          eventTime: "2026-04-10T22:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-UNV-01",
          cameraId: "unv-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          analyticsName: "Cross Line Detection",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/uniview-camera-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T22:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/uniview-camera-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "unv-smart-event"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "line_crossing");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "uniview:camera:UNV-CAM-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "uniview");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "uniview-ip-camera");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-UNV-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "unv-smart-event");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "uniview"
          && entry.payload?.sourceType === "camera"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/uniview/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "UNV-CAM-500",
          eventCode: "CrossLineDetection",
          eventTime: "2026-04-10T22:30:00.000Z",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/uniview/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T22:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/uniview/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "UNV-CAM-501",
          eventCode: "VideoLoss",
          eventTime: "2026-04-10T22:40:00.000Z",
          siteId: "site-unknown",
          cameraSerialNumber: "AX-1468-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/uniview/ip-camera", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "UNV-CAM-502",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T22:45:00.000Z",
          cameraSerialNumber: "UNKNOWN-CAM"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers hikvision nvr adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/hikvision/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-NVR-500",
          eventCode: "VideoMotion",
          eventType: "motionDetection",
          eventTime: "2026-04-10T19:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-HIK-NVR-01",
          nvrId: "hik-nvr-hafen-1",
          nvrName: "Hikvision Hafen Recorder",
          nvrSerialNumber: "NVR-820-001",
          nvrIp: "10.12.0.10",
          cameraId: "hikvision-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          channel: 1,
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/hikvision-nvr-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T19:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/hikvision-nvr-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "isapi-racm"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "motion");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "hikvision:nvr:HIK-NVR-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "hikvision");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "nvr");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "hikvision-nvr");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-HIK-NVR-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "isapi-racm");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "hikvision"
          && entry.payload?.sourceType === "nvr"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/hikvision/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-NVR-500",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T19:30:00.000Z",
          nvrSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/hikvision/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T19:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/hikvision/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-NVR-501",
          eventCode: "hdError",
          eventTime: "2026-04-10T19:40:00.000Z",
          siteId: "site-unknown",
          nvrSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/hikvision/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "HIK-NVR-502",
          eventCode: "VideoMotion",
          eventTime: "2026-04-10T19:45:00.000Z",
          nvrSerialNumber: "UNKNOWN-NVR"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers axis nvr adapter normalization duplicate handling and invalid payloads", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      externalAlarmIngestion: {
        sharedSecret: "external-secret"
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const acceptedResponse = await request("/api/v1/alarm-ingestion/external/axis/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-NVR-500",
          eventCode: "UniversalMotionDetection",
          eventType: "ForwardedMotion",
          eventTime: "2026-04-10T21:30:00.000Z",
          siteId: "site-hamburg-hafen",
          siteExternalHint: "HH-HAFEN-AXIS-NVR-01",
          nvrId: "axis-nvr-hafen-1",
          nvrName: "Axis Hafen Recorder",
          nvrSerialNumber: "NVR-820-001",
          nvrIp: "10.12.0.10",
          cameraId: "axis-cam-yard-1",
          cameraName: "Yard Kamera 1",
          cameraSerialNumber: "AX-1468-001",
          cameraIp: "10.12.0.21",
          channel: 1,
          severity: "warning",
          zone: "yard-entry",
          ruleName: "Nordtor Linie",
          media: [
            {
              mediaType: "snapshot",
              url: "https://example.test/axis-nvr-snapshot.jpg",
              mimeType: "image/jpeg",
              capturedAt: "2026-04-10T21:30:01.000Z",
              cameraSerialNumber: "AX-1468-001"
            },
            {
              mediaType: "clip",
              url: "https://example.test/axis-nvr-clip.mp4",
              mimeType: "video/mp4"
            }
          ],
          rawPayload: {
            vendorEventSource: "vapix-recorder-event-stream"
          }
        }
      });
      assert.equal(acceptedResponse.status, 200);
      assert.equal(acceptedResponse.body.data.duplicate, false);
      assert.equal(acceptedResponse.body.data.alarmCase.alarmType, "motion");
      assert.equal(acceptedResponse.body.data.alarmCase.priority, "high");
      assert.equal(acceptedResponse.body.data.alarmCase.externalSourceRef, "axis:nvr:AXIS-NVR-500");
      assert.equal(acceptedResponse.body.data.resolution.primaryDeviceId, "device-camera-yard-1");
      assert.equal(acceptedResponse.body.data.media.length, 2);

      const detailResponse = await request(`/api/v1/alarm-cases/${acceptedResponse.body.data.alarmCase.id}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.data.alarmCase.primaryDeviceId, "device-camera-yard-1");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceSystem, "axis");
      assert.equal(detailResponse.body.data.alarmCase.technicalDetails.externalSourceType, "nvr");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.adapter, "axis-nvr");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.siteExternalHint, "HH-HAFEN-AXIS-NVR-01");
      assert.equal(detailResponse.body.data.alarmCase.sourcePayload.vendorPayload.vendorEventSource, "vapix-recorder-event-stream");
      assert.ok(
        detailResponse.body.data.events.some((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
          entry.eventKind === "payload_updated"
          && entry.payload?.sourceSystem === "axis"
          && entry.payload?.sourceType === "nvr"
          && entry.payload?.cameraName === "Yard Kamera 1"
        )
      );

      const duplicateResponse = await request("/api/v1/alarm-ingestion/external/axis/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-NVR-500",
          eventCode: "UniversalMotionDetection",
          eventTime: "2026-04-10T21:30:00.000Z",
          nvrSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(duplicateResponse.status, 200);
      assert.equal(duplicateResponse.body.data.duplicate, true);
      assert.equal(duplicateResponse.body.data.alarmCase.id, acceptedResponse.body.data.alarmCase.id);

      const invalidPayloadResponse = await request("/api/v1/alarm-ingestion/external/axis/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "",
          eventTime: "2026-04-10T21:35:00.000Z"
        }
      });
      assert.equal(invalidPayloadResponse.status, 400);
      assert.match(invalidPayloadResponse.body.detail, /sourceEventId|eventCode/i);

      const unknownSiteResponse = await request("/api/v1/alarm-ingestion/external/axis/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-NVR-501",
          eventCode: "DiskError",
          eventTime: "2026-04-10T21:40:00.000Z",
          siteId: "site-unknown",
          nvrSerialNumber: "NVR-820-001"
        }
      });
      assert.equal(unknownSiteResponse.status, 404);
      assert.equal(unknownSiteResponse.body.code, "ALARM_EXTERNAL_SITE_NOT_FOUND");

      const unknownDeviceResponse = await request("/api/v1/alarm-ingestion/external/axis/nvr", {
        method: "POST",
        headers: {
          "x-alarm-ingestion-key": "external-secret"
        },
        body: {
          sourceEventId: "AXIS-NVR-502",
          eventCode: "UniversalMotionDetection",
          eventTime: "2026-04-10T21:45:00.000Z",
          nvrSerialNumber: "UNKNOWN-NVR"
        }
      });
      assert.equal(unknownDeviceResponse.status, 404);
      assert.equal(unknownDeviceResponse.body.code, "ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND");
    }
  );
});

test("smoke flow covers exclusive reservation, release, reassign, override and logout guard hooks", async () => {
  const adminLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.data.session.token as string;

  const operatorLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLogin.status, 200);
  const operatorToken = operatorLogin.body.data.session.token as string;

  const leitungLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "leitung",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(leitungLogin.status, 200);
  const leitungToken = leitungLogin.body.data.session.token as string;

  const ingestionResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      primaryDeviceId: "device-camera-yard-1",
      externalSourceRef: "SRC-M4D-100",
      alarmType: "intrusion",
      priority: "high",
      title: "Reservation smoke case"
    }
  });
  assert.equal(ingestionResponse.status, 200);
  const alarmCaseId = ingestionResponse.body.data.alarmCase.id as string;

  const reserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(reserveResponse.status, 200);
  assert.equal(reserveResponse.body.data.assignment.userId, "user-operator");
  assert.equal(reserveResponse.body.data.alarmCase.lifecycleStatus, "reserved");

  const blockedReserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: leitungToken,
    body: {}
  });
  assert.equal(blockedReserveResponse.status, 409);
  assert.equal(blockedReserveResponse.body.code, "ALARM_ALREADY_RESERVED");

  const logoutBlockedResponse = await apiRequest("/api/v1/auth/logout", {
    method: "POST",
    token: operatorToken
  });
  assert.equal(logoutBlockedResponse.status, 409);
  assert.equal(logoutBlockedResponse.body.code, "AUTH_LOGOUT_BLOCKED");
  assert.match(logoutBlockedResponse.body.detail, /active alarm assignment/i);

  const reassignResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reassign`, {
    method: "POST",
    token: operatorToken,
    body: {
      targetUserId: "user-leitung",
      reason: "Leitung uebernimmt"
    }
  });
  assert.equal(reassignResponse.status, 200);
  assert.equal(reassignResponse.body.data.assignment.userId, "user-leitung");
  assert.equal(reassignResponse.body.data.releasedAssignmentId !== undefined, true);

  const operatorReleaseDeniedResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/release`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(operatorReleaseDeniedResponse.status, 403);
  assert.equal(operatorReleaseDeniedResponse.body.code, "ALARM_RELEASE_FORBIDDEN");

  const overrideReserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: adminToken,
    body: {
      targetUserId: "user-admin",
      override: true,
      reason: "Admin override"
    }
  });
  assert.equal(overrideReserveResponse.status, 200);
  assert.equal(overrideReserveResponse.body.data.assignment.userId, "user-admin");

  const adminReleaseResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/release`, {
    method: "POST",
    token: adminToken,
    body: {
      reason: "Manuelle Freigabe"
    }
  });
  assert.equal(adminReleaseResponse.status, 200);
  assert.equal(adminReleaseResponse.body.data.alarmCase.lifecycleStatus, "queued");

  const adminLogoutResponse = await apiRequest("/api/v1/auth/logout", {
    method: "POST",
    token: adminToken
  });
  assert.equal(adminLogoutResponse.status, 200);

  const operatorSessionResponse = await apiRequest("/api/v1/auth/session", {
    method: "GET",
    token: operatorToken
  });
  assert.equal(operatorSessionResponse.status, 200);
  assert.equal(operatorSessionResponse.body.data.session.user.status, "aktiv");

  const pipelineResponse = await apiRequest("/api/v1/alarm-cases/open", {
    method: "GET",
    token: leitungToken
  });
  assert.equal(pipelineResponse.status, 200);
  const pipelineItem = pipelineResponse.body.data.items.find((entry: { id: string }) => entry.id === alarmCaseId);
  assert.ok(pipelineItem);
  assert.equal(pipelineItem.lifecycleStatus, "queued");
  assert.equal(pipelineItem.activeAssignment, undefined);

  const auditDatabase = createDatabaseClient(testConfig);
  const assignmentAuditCount = await auditDatabase.query<{ total: string }>(
    "select count(*)::text as total from audit_events where category = 'alarm.assignment' and subject_id = $1",
    [alarmCaseId]
  );
  const activeAssignmentCount = await auditDatabase.query<{ total: string }>(
    "select count(*)::text as total from alarm_assignments where alarm_case_id = $1 and assignment_status = 'active'",
    [alarmCaseId]
  );
  await auditDatabase.close();

  assert.ok(Number(assignmentAuditCount.rows[0]?.total ?? "0") >= 4);
  assert.equal(Number(activeAssignmentCount.rows[0]?.total ?? "0"), 0);
});

test("smoke flow covers optional auto-assignment light on ingestion", async () => {
  await withTemporaryApp(
    {
      ...testConfig,
      alarmAssignment: {
        autoAssignLightEnabled: true
      }
    },
    async (request) => {
      const operatorLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "operator",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(operatorLogin.status, 200);
      const operatorToken = operatorLogin.body.data.session.token as string;

      const operatorActiveResponse = await request("/api/v1/auth/status/active", {
        method: "POST",
        token: operatorToken
      });
      assert.equal(operatorActiveResponse.status, 200);
      assert.equal(operatorActiveResponse.body.data.user.status, "aktiv");

      const leitungLogin = await request("/api/v1/auth/login", {
        method: "POST",
        body: {
          identifier: "leitung",
          password: testConfig.auth.bootstrapPassword
        }
      });
      assert.equal(leitungLogin.status, 200);
      const leitungToken = leitungLogin.body.data.session.token as string;

      const leitungPauseResponse = await request("/api/v1/auth/status/pause", {
        method: "POST",
        token: leitungToken,
        body: {
          reason: "Auto-Assign-Light-Test"
        }
      });
      assert.equal(leitungPauseResponse.status, 200);
      assert.equal(leitungPauseResponse.body.data.user.status, "in_pause");

      const ingestionResponse = await request("/api/v1/alarm-ingestion", {
        method: "POST",
        body: {
          siteId: "site-hamburg-hafen",
          primaryDeviceId: "device-camera-yard-1",
          externalSourceRef: "SRC-AUTO-LIGHT-1",
          alarmType: "motion",
          priority: "high",
          title: "Auto assignment light smoke case"
        }
      });
      assert.equal(ingestionResponse.status, 200);
      const alarmCaseId = ingestionResponse.body.data.alarmCase.id as string;

      const pipelineResponse = await request("/api/v1/alarm-cases/open", {
        method: "GET",
        token: operatorToken
      });
      assert.equal(pipelineResponse.status, 200);
      const pipelineItem = pipelineResponse.body.data.items.find((entry: { id: string }) => entry.id === alarmCaseId);
      assert.ok(pipelineItem);
      assert.equal(pipelineItem.lifecycleStatus, "reserved");
      assert.equal(pipelineItem.activeAssignment?.userId, "user-operator");

      const detailResponse = await request(`/api/v1/alarm-cases/${alarmCaseId}`, {
        method: "GET",
        token: operatorToken
      });
      assert.equal(detailResponse.status, 200);
      const assignmentEvent = detailResponse.body.data.events.find((entry: { eventKind: string; payload?: Record<string, unknown> }) =>
        entry.eventKind === "assignment_changed" && entry.payload?.trigger === "auto_assignment_light"
      );
      assert.ok(assignmentEvent);

      const auditDatabase = createDatabaseClient(testConfig);
      const autoAssignAuditCount = await auditDatabase.query<{ total: string }>(
        "select count(*)::text as total from audit_events where action = 'alarm.assignment.auto.reserve' and subject_id = $1",
        [alarmCaseId]
      );
      await auditDatabase.close();
      assert.equal(Number(autoAssignAuditCount.rows[0]?.total ?? "0"), 1);
    }
  );
});

test("smoke flow covers catalogs, assessment, comments, closing, archiving and archived write protection", async () => {
  const operatorLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLogin.status, 200);
  const operatorToken = operatorLogin.body.data.session.token as string;

  const catalogsResponse = await apiRequest("/api/v1/alarm-catalogs", {
    method: "GET",
    token: operatorToken
  });
  assert.equal(catalogsResponse.status, 200);
  assert.ok(catalogsResponse.body.data.falsePositiveReasons.length >= 1);
  assert.ok(catalogsResponse.body.data.closureReasons.length >= 1);
  assert.equal(catalogsResponse.body.data.actionTypes.length, 5);
  assert.ok(catalogsResponse.body.data.actionTypes.some((entry: { code: string }) => entry.code === "call_police"));
  assert.ok(catalogsResponse.body.data.actionTypes.some((entry: { code: string }) => entry.code === "speaker_pre_recorded_announcement"));
  assert.ok(catalogsResponse.body.data.actionStatuses.length >= 6);
  assert.ok(catalogsResponse.body.data.actionStatuses.some((entry: { code: string }) => entry.code === "completed"));
  assert.ok(catalogsResponse.body.data.actionStatuses.some((entry: { code: string }) => entry.code === "not_reachable"));
  assert.ok(catalogsResponse.body.data.workflowProfiles.length >= 1);
  assert.equal(catalogsResponse.body.data.workflowProfiles[0].siteId, "site-hamburg-hafen");
  assert.ok(catalogsResponse.body.data.workflowProfiles[0].steps.length >= 3);
  assert.ok(catalogsResponse.body.data.workflowProfiles.some((entry: { timeContext: string }) => entry.timeContext === "weekend"));
  assert.ok(catalogsResponse.body.data.workflowProfiles.some((entry: { timeContext: string; specialContextLabel?: string }) => entry.timeContext === "special" && entry.specialContextLabel === "storm_mode"));
  assert.ok(
    catalogsResponse.body.data.workflowProfiles[0].steps.some(
      (entry: { actionTypeCode?: string; isRequiredByDefault: boolean }) =>
        entry.actionTypeCode === "call_customer" && entry.isRequiredByDefault
    )
  );

  const workflowProfileResponse = await apiRequest("/api/v1/alarm-workflow-profiles", {
    method: "POST",
    token: operatorToken,
    body: {
      siteId: "site-hamburg-hafen",
      code: "hamburg_hafen_special_lockdown",
      label: "Hamburg Hafen Sonderlage Lockdown",
      description: "Sonderlage fuer verschlossene Hafenflaechen.",
      timeContext: "special",
      specialContextLabel: "lockdown_mode",
      isActive: true,
      sortOrder: 40,
      steps: [
        {
          stepCode: "lockdown_customer",
          title: "Kunde in Lockdown informieren",
          instruction: "Kundenkontakt fuer Sonderlage Lockdown herstellen.",
          sortOrder: 10,
          isRequiredByDefault: true,
          actionTypeId: "action-call-customer"
        }
      ]
    }
  });
  assert.equal(workflowProfileResponse.status, 200);
  assert.equal(workflowProfileResponse.body.data.profile.timeContext, "special");

  const workflowListResponse = await apiRequest("/api/v1/alarm-workflow-profiles?siteId=site-hamburg-hafen&timeContext=special", {
    method: "GET",
    token: operatorToken
  });
  assert.equal(workflowListResponse.status, 200);
  assert.ok(workflowListResponse.body.data.profiles.some((entry: { specialContextLabel?: string }) => entry.specialContextLabel === "lockdown_mode"));

  const falsePositiveReasonId = catalogsResponse.body.data.falsePositiveReasons[0].id as string;
  const callCustomerActionTypeId = catalogsResponse.body.data.actionTypes.find((entry: { code: string }) => entry.code === "call_customer")?.id as string;
  const callPoliceActionTypeId = catalogsResponse.body.data.actionTypes.find((entry: { code: string }) => entry.code === "call_police")?.id as string;
  const completedStatusId = catalogsResponse.body.data.actionStatuses.find((entry: { code: string }) => entry.code === "completed")?.id as string;
  const notReachableStatusId = catalogsResponse.body.data.actionStatuses.find((entry: { code: string }) => entry.code === "not_reachable")?.id as string;
  const closureReasonId = catalogsResponse.body.data.closureReasons.find((entry: { code: string }) => entry.code === "false_positive_verified")?.id
    ?? catalogsResponse.body.data.closureReasons[0].id;

  const ingestionResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      primaryDeviceId: "device-camera-yard-1",
      alarmType: "motion",
      priority: "normal",
      title: "Case management smoke case"
    }
  });
  assert.equal(ingestionResponse.status, 200);
  const alarmCaseId = ingestionResponse.body.data.alarmCase.id as string;

  const reserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(reserveResponse.status, 200);

  const acknowledgeResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/acknowledge`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(acknowledgeResponse.status, 200);
  assert.equal(acknowledgeResponse.body.data.alarmCase.lifecycleStatus, "in_progress");

  const pendingCloseResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/close`, {
    method: "POST",
    token: operatorToken,
    body: {
      closureReasonId
    }
  });
  assert.equal(pendingCloseResponse.status, 409);
  assert.equal(pendingCloseResponse.body.code, "ALARM_CASE_ASSESSMENT_REQUIRED");

  const invalidAssessmentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/assessment`, {
    method: "POST",
    token: operatorToken,
    body: {
      assessmentStatus: "false_positive"
    }
  });
  assert.equal(invalidAssessmentResponse.status, 400);
  assert.equal(invalidAssessmentResponse.body.code, "ALARM_FALSE_POSITIVE_REASON_REQUIRED");

  const assessmentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/assessment`, {
    method: "POST",
    token: operatorToken,
    body: {
      assessmentStatus: "false_positive",
      falsePositiveReasonIds: [falsePositiveReasonId]
    }
  });
  assert.equal(assessmentResponse.status, 200);
  assert.equal(assessmentResponse.body.data.alarmCase.assessmentStatus, "false_positive");
  assert.equal(assessmentResponse.body.data.falsePositiveReasons.length, 1);

  const commentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/comments`, {
    method: "POST",
    token: operatorToken,
    body: {
      body: "Vor Ort geprueft, kein echter Vorfall.",
      commentKind: "operator_note"
    }
  });
  assert.equal(commentResponse.status, 200);
  assert.equal(commentResponse.body.data.comment.commentKind, "operator_note");

  const firstActionResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/actions`, {
    method: "POST",
    token: operatorToken,
    body: {
      actionTypeId: callCustomerActionTypeId,
      statusId: completedStatusId,
      comment: "Kunde informiert und Lage abgestimmt.",
      occurredAt: "2026-04-10T08:15:00.000Z"
    }
  });
  assert.equal(firstActionResponse.status, 200);
  assert.equal(firstActionResponse.body.data.action.actionTypeCode, "call_customer");
  assert.equal(firstActionResponse.body.data.action.statusCode, "completed");

  const secondActionResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/actions`, {
    method: "POST",
    token: operatorToken,
    body: {
      actionTypeId: callPoliceActionTypeId,
      statusId: notReachableStatusId,
      comment: "Polizei nicht erreichbar, erneuter Versuch vorgesehen."
    }
  });
  assert.equal(secondActionResponse.status, 200);
  assert.equal(secondActionResponse.body.data.action.actionTypeCode, "call_police");
  assert.equal(secondActionResponse.body.data.action.statusCode, "not_reachable");

  const invalidCloseResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/close`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(invalidCloseResponse.status, 400);

  const closeResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/close`, {
    method: "POST",
    token: operatorToken,
    body: {
      closureReasonId,
      comment: "Fehlalarm sauber abgeschlossen."
    }
  });
  assert.equal(closeResponse.status, 200);
  assert.equal(closeResponse.body.data.alarmCase.lifecycleStatus, "resolved");
  assert.equal(closeResponse.body.data.alarmCase.closureReasonId, closureReasonId);

  const detailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}?timeContext=normal`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.data.alarmCase.id, alarmCaseId);
  assert.equal(detailResponse.body.data.alarmCase.assessmentStatus, "false_positive");
  assert.equal(detailResponse.body.data.falsePositiveReasons.length, 1);
  assert.equal(detailResponse.body.data.closureReason.id, closureReasonId);
  assert.ok(detailResponse.body.data.comments.length >= 2);
  assert.equal(detailResponse.body.data.actions.length, 2);
  assert.ok(detailResponse.body.data.actions.some((entry: { actionTypeCode: string; statusCode: string }) => entry.actionTypeCode === "call_customer" && entry.statusCode === "completed"));
  assert.ok(detailResponse.body.data.actions.some((entry: { actionTypeCode: string; statusCode: string }) => entry.actionTypeCode === "call_police" && entry.statusCode === "not_reachable"));
  assert.ok(detailResponse.body.data.events.some((entry: { eventKind: string }) => entry.eventKind === "assessment_changed"));
  assert.ok(detailResponse.body.data.events.some((entry: { eventKind: string }) => entry.eventKind === "comment_added"));
  assert.ok(detailResponse.body.data.events.some((entry: { eventKind: string }) => entry.eventKind === "action_documented"));
  assert.ok(detailResponse.body.data.assignments.some((entry: { assignmentStatus: string }) => entry.assignmentStatus === "released"));
  assert.equal(detailResponse.body.data.instructionContext.timeContext, "normal");

  const weekendDetailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}?timeContext=weekend`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(weekendDetailResponse.status, 200);
  assert.equal(weekendDetailResponse.body.data.instructionContext.timeContext, "weekend");
  assert.ok(weekendDetailResponse.body.data.instructionContext.profiles.length >= 1);

  const specialDetailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}?timeContext=special&specialContextLabel=lockdown_mode`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(specialDetailResponse.status, 200);
  assert.equal(specialDetailResponse.body.data.instructionContext.timeContext, "special");
  assert.ok(
    specialDetailResponse.body.data.instructionContext.profiles.some(
      (entry: { specialContextLabel?: string }) => entry.specialContextLabel === "lockdown_mode"
    )
  );

  const archiveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/archive`, {
    method: "POST",
    token: operatorToken,
    body: {
      comment: "Fall kann archiviert werden."
    }
  });
  assert.equal(archiveResponse.status, 200);
  assert.equal(archiveResponse.body.data.alarmCase.lifecycleStatus, "archived");

  const archivedDetailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(archivedDetailResponse.status, 200);
  assert.equal(archivedDetailResponse.body.data.isArchived, true);
  assert.equal(archivedDetailResponse.body.data.alarmCase.archivedByUserId, "user-operator");

  const archivedCommentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/comments`, {
    method: "POST",
    token: operatorToken,
    body: {
      body: "Darf nicht mehr gespeichert werden."
    }
  });
  assert.equal(archivedCommentResponse.status, 409);
  assert.equal(archivedCommentResponse.body.code, "ALARM_CASE_ARCHIVED");

  const archivedActionResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/actions`, {
    method: "POST",
    token: operatorToken,
    body: {
      actionTypeId: callCustomerActionTypeId,
      statusId: completedStatusId,
      comment: "Darf nicht mehr dokumentiert werden."
    }
  });
  assert.equal(archivedActionResponse.status, 409);
  assert.equal(archivedActionResponse.body.code, "ALARM_CASE_ARCHIVED");

  const archivedReserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(archivedReserveResponse.status, 409);
  assert.equal(archivedReserveResponse.body.code, "ALARM_CASE_ARCHIVED");

  const auditDatabase = createDatabaseClient(testConfig);
  const caseAuditCount = await auditDatabase.query<{ total: string }>(
    "select count(*)::text as total from audit_events where category = 'alarm.case' and subject_id = $1",
    [alarmCaseId]
  );
  const actionAuditCount = await auditDatabase.query<{ total: string }>(
    "select count(*)::text as total from audit_events where category = 'alarm.action' and subject_id = $1",
    [alarmCaseId]
  );
  await auditDatabase.close();
  assert.ok(Number(caseAuditCount.rows[0]?.total ?? "0") >= 5);
  assert.equal(Number(actionAuditCount.rows[0]?.total ?? "0"), 2);
});

test("smoke flow covers case report and single-case exports with role checks", async () => {
  const operatorLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLogin.status, 200);
  const operatorToken = operatorLogin.body.data.session.token as string;

  const serviceLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "service",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(serviceLogin.status, 200);
  const serviceToken = serviceLogin.body.data.session.token as string;

  const ingestionResponse = await apiRequest("/api/v1/alarm-ingestion", {
    method: "POST",
    body: {
      siteId: "site-hamburg-hafen",
      primaryDeviceId: "device-camera-yard-1",
      alarmType: "motion",
      priority: "high",
      title: "Case report export alarm",
      media: [
        {
          deviceId: "device-camera-yard-1",
          mediaKind: "snapshot",
          storageKey: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMjAgMjAwIj48cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y3ZjJlOCIvPjx0ZXh0IHg9IjE2MCIgeT0iMTA0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iU2Vnb2UgVUksIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiMxZDJhMmYiPk1FRElBIERFTU88L3RleHQ+PC9zdmc+",
          mimeType: "image/svg+xml",
          capturedAt: "2026-04-10T09:01:00.000Z"
        }
      ]
    }
  });
  assert.equal(ingestionResponse.status, 200);
  const alarmCaseId = ingestionResponse.body.data.alarmCase.id as string;
  const activeMediaId = ingestionResponse.body.data.media[0].id as string;

  const activeMediaInlineResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/media/${activeMediaId}/access?mode=inline`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(activeMediaInlineResponse.status, 200);
  assert.equal(activeMediaInlineResponse.body.data.document.mimeType, "image/svg+xml");
  assert.equal(activeMediaInlineResponse.body.data.document.sourceKind, "embedded");
  assert.match(Buffer.from(activeMediaInlineResponse.body.data.document.contentBase64, "base64").toString("utf8"), /MEDIA DEMO/);

  const activeMediaDownloadResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/media/${activeMediaId}/access?mode=download`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(activeMediaDownloadResponse.status, 200);
  assert.equal(activeMediaDownloadResponse.body.data.document.filename.endsWith(".svg"), true);

  const archivePathBeforeArchiveResponse = await apiRequest(`/api/v1/alarm-media/${activeMediaId}/access?mode=inline`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(archivePathBeforeArchiveResponse.status, 409);
  assert.equal(archivePathBeforeArchiveResponse.body.code, "ALARM_MEDIA_ARCHIVE_REQUIRED");

  const reserveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(reserveResponse.status, 200);

  const commentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/comments`, {
    method: "POST",
    token: operatorToken,
    body: {
      body: "Report comment",
      commentKind: "operator_note"
    }
  });
  assert.equal(commentResponse.status, 200);

  const actionResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/actions`, {
    method: "POST",
    token: operatorToken,
    body: {
      actionTypeId: "action-call-customer",
      statusId: "action-status-completed",
      comment: "Customer contacted for report"
    }
  });
  assert.equal(actionResponse.status, 200);

  const assessmentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/assessment`, {
    method: "POST",
    token: operatorToken,
    body: {
      assessmentStatus: "confirmed_incident"
    }
  });
  assert.equal(assessmentResponse.status, 200);

  const closeResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/close`, {
    method: "POST",
    token: operatorToken,
    body: {
      closureReasonId: "closure-incident-handled",
      comment: "Case report close"
    }
  });
  assert.equal(closeResponse.status, 200);

  const archiveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/archive`, {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(archiveResponse.status, 200);

  const reportResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/report`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(reportResponse.status, 200);
  const report = reportResponse.body.data.report;
  assert.equal(report.alarmCase.id, alarmCaseId);
  assert.equal(report.site.siteName, "Hamburg Hafen");
  assert.ok(report.actors.some((entry: { displayName: string }) => entry.displayName === "Operator Standard"));
  assert.ok(report.comments.some((entry: { body: string }) => entry.body === "Report comment"));
  assert.ok(report.actions.some((entry: { comment: string }) => entry.comment === "Customer contacted for report"));
  assert.equal(report.isArchived, true);
  assert.equal(report.media.length, 1);

  const archiveListResponse = await apiRequest(
    "/api/v1/alarm-cases/archive?period=custom&dateFrom=2026-04-01&dateTo=2026-04-30&siteId=site-hamburg-hafen&cameraId=device-camera-yard-1&alarmType=motion&assessmentStatus=confirmed_incident&operatorUserId=user-operator&closureReasonId=closure-incident-handled&lifecycleScope=archived",
    {
      method: "GET",
      token: operatorToken
    }
  );
  assert.equal(archiveListResponse.status, 200);
  assert.ok(archiveListResponse.body.data.items.some((entry: { id: string; mediaCount: number }) => entry.id === alarmCaseId && entry.mediaCount === 1));

  const textExportResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/export?format=case_report`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(textExportResponse.status, 200);
  const textDocument = textExportResponse.body.data.document;
  assert.equal(textDocument.format, "case_report");
  assert.match(Buffer.from(textDocument.contentBase64, "base64").toString("utf8"), /Case report export alarm/);

  const excelExportResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/export?format=excel`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(excelExportResponse.status, 200);
  const excelDocument = excelExportResponse.body.data.document;
  assert.equal(excelDocument.format, "excel");
  assert.match(Buffer.from(excelDocument.contentBase64, "base64").toString("utf8"), /section;timestamp;type;label;value;actor/);

  const pdfExportResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/export?format=pdf`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(pdfExportResponse.status, 200);
  const pdfDocument = pdfExportResponse.body.data.document;
  assert.equal(pdfDocument.format, "pdf");
  assert.ok(Buffer.from(pdfDocument.contentBase64, "base64").subarray(0, 4).equals(Buffer.from("%PDF")));

  const mediaId = report.media[0].id as string;
  const mediaInlineResponse = await apiRequest(`/api/v1/alarm-media/${mediaId}/access?mode=inline`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(mediaInlineResponse.status, 200);
  assert.equal(mediaInlineResponse.body.data.document.mimeType, "image/svg+xml");
  assert.equal(mediaInlineResponse.body.data.document.sourceKind, "embedded");
  assert.match(Buffer.from(mediaInlineResponse.body.data.document.contentBase64, "base64").toString("utf8"), /MEDIA DEMO/);

  const mediaDownloadResponse = await apiRequest(`/api/v1/alarm-media/${mediaId}/access?mode=download`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(mediaDownloadResponse.status, 200);
  assert.equal(mediaDownloadResponse.body.data.document.filename.endsWith(".svg"), true);

  const activePathAfterArchiveResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/media/${mediaId}/access?mode=inline`, {
    method: "GET",
    token: operatorToken
  });
  assert.equal(activePathAfterArchiveResponse.status, 409);
  assert.equal(activePathAfterArchiveResponse.body.code, "ALARM_MEDIA_ARCHIVE_PATH_REQUIRED");

  const forbiddenResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/report`, {
    method: "GET",
    token: serviceToken
  });
  assert.equal(forbiddenResponse.status, 403);
  assert.equal(forbiddenResponse.body.code, "ALARM_CASE_REPORT_FORBIDDEN");

  const archiveForbiddenResponse = await apiRequest(`/api/v1/alarm-cases/archive?period=month&lifecycleScope=archived`, {
    method: "GET",
    token: serviceToken
  });
  assert.equal(archiveForbiddenResponse.status, 403);
  assert.equal(archiveForbiddenResponse.body.code, "ALARM_ARCHIVE_FORBIDDEN");

  const archivedDetailForbiddenResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}`, {
    method: "GET",
    token: serviceToken
  });
  assert.equal(archivedDetailForbiddenResponse.status, 403);
  assert.equal(archivedDetailForbiddenResponse.body.code, "ALARM_ARCHIVE_FORBIDDEN");

  const mediaForbiddenResponse = await apiRequest(`/api/v1/alarm-media/${mediaId}/access?mode=download`, {
    method: "GET",
    token: serviceToken
  });
  assert.equal(mediaForbiddenResponse.status, 403);
  assert.equal(mediaForbiddenResponse.body.code, "ALARM_ARCHIVE_FORBIDDEN");

  const activeMediaForbiddenResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/media/${mediaId}/access?mode=download`, {
    method: "GET",
    token: serviceToken
  });
  assert.equal(activeMediaForbiddenResponse.status, 403);
  assert.equal(activeMediaForbiddenResponse.body.code, "ALARM_MEDIA_ACCESS_FORBIDDEN");
});

test("smoke flow covers monitoring retries, disturbance creation, vpn prerequisite and recovery", async () => {
  let cameraHealthy = false;
  const probeServer = createServer((req, res) => {
    if (req.url === "/camera/health") {
      res.statusCode = cameraHealthy ? 200 : 503;
      res.end(cameraHealthy ? "ok" : "unreachable");
      return;
    }

    res.statusCode = 200;
    res.end("vpn-ok");
  });
  probeServer.listen(0, "127.0.0.1");
  await once(probeServer, "listening");

  const address = probeServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Probe server address is unavailable.");
  }

  const database = createDatabaseClient(testConfig);
  const store = createMonitoringStore(database);
  const service = createMonitoringScanService({ store });

  try {
    await database.query("delete from monitoring_check_states");
    await database.query("delete from monitoring_disturbances");
    await database.query("delete from monitoring_check_targets where site_id = 'site-hamburg-hafen'");
    await database.query(
      "update site_settings set monitoring_interval_seconds = 1, failure_threshold = 2 where site_id = 'site-hamburg-hafen'"
    );
    await database.query(
      `
        insert into monitoring_check_targets(
          id, scope, site_id, device_id, label, check_kind, endpoint, port, path, request_method,
          expected_status_codes, timeout_ms, requires_vpn, disturbance_type_id, is_active, sort_order
        )
        values
          ('test-monitor-vpn', 'site', 'site-hamburg-hafen', null, 'Test VPN', 'vpn', '127.0.0.1', $1, null, null, array[200], 1000, false, 'disturbance-type-site-connection', true, 10),
          ('test-monitor-camera-http', 'device', 'site-hamburg-hafen', 'device-camera-yard-1', 'Test Camera HTTP', 'http', $2, null, '/camera/health', 'GET', array[200], 1000, true, 'disturbance-type-camera-unreachable', true, 20)
      `,
      [address.port, `http://127.0.0.1:${address.port}`]
    );

    const firstScan = await service.runOnce({
      now: new Date("2026-04-10T09:00:00.000Z")
    });
    assert.equal(firstScan.checkedCount, 2);
    assert.equal(firstScan.openedCount, 0);

    const secondScan = await service.runOnce({
      now: new Date("2026-04-10T09:00:02.000Z")
    });
    assert.equal(secondScan.openedCount, 1);
    assert.ok(secondScan.targets.some((entry) => entry.targetId === "test-monitor-camera-http" && entry.outcome === "failed" && entry.disturbanceId));

    let disturbances = await database.query<{ total: string }>(
      "select count(*)::text as total from monitoring_disturbances where status = 'open' and disturbance_type_id = 'disturbance-type-camera-unreachable'"
    );
    let siteStatus = await database.query<{ technical_status: string }>("select technical_status from sites where id = 'site-hamburg-hafen'");
    assert.equal(Number(disturbances.rows[0]?.total ?? "0"), 1);
    assert.equal(siteStatus.rows[0]?.technical_status, "disturbed");

    cameraHealthy = true;
    const recoveryScan = await service.runOnce({
      now: new Date("2026-04-10T09:00:04.000Z")
    });
    assert.equal(recoveryScan.resolvedCount, 1);

    disturbances = await database.query<{ total: string }>(
      "select count(*)::text as total from monitoring_disturbances where status = 'open'"
    );
    siteStatus = await database.query<{ technical_status: string }>("select technical_status from sites where id = 'site-hamburg-hafen'");
    assert.equal(Number(disturbances.rows[0]?.total ?? "0"), 0);
    assert.equal(siteStatus.rows[0]?.technical_status, "ok");

    probeServer.close();
    await once(probeServer, "close");

    const vpnFirstFailure = await service.runOnce({
      now: new Date("2026-04-10T09:00:06.000Z")
    });
    assert.ok(vpnFirstFailure.targets.some((entry) => entry.targetId === "test-monitor-vpn" && entry.outcome === "failed"));
    assert.ok(vpnFirstFailure.targets.some((entry) => entry.targetId === "test-monitor-camera-http" && entry.outcome === "skipped"));

    const vpnSecondFailure = await service.runOnce({
      now: new Date("2026-04-10T09:00:08.000Z")
    });
    assert.equal(vpnSecondFailure.openedCount, 1);
    assert.ok(vpnSecondFailure.targets.some((entry) => entry.targetId === "test-monitor-camera-http" && entry.outcome === "skipped"));

    disturbances = await database.query<{ total: string }>(
      "select count(*)::text as total from monitoring_disturbances where status = 'open' and disturbance_type_id = 'disturbance-type-site-connection'"
    );
    siteStatus = await database.query<{ technical_status: string }>("select technical_status from sites where id = 'site-hamburg-hafen'");
    const skippedState = await database.query<{ last_status: string; consecutive_failures: string }>(
      "select last_status, consecutive_failures::text from monitoring_check_states where target_id = 'test-monitor-camera-http'"
    );
    assert.equal(Number(disturbances.rows[0]?.total ?? "0"), 1);
    assert.equal(siteStatus.rows[0]?.technical_status, "offline");
    assert.equal(skippedState.rows[0]?.last_status, "skipped");
    assert.equal(Number(skippedState.rows[0]?.consecutive_failures ?? "0"), 0);
  } finally {
    if (probeServer.listening) {
      probeServer.close();
      await once(probeServer, "close");
    }
    await database.close();
  }
});

test("smoke flow covers monitoring pipeline, detail view, acknowledge and notes", async () => {
  const operatorLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLogin.status, 200);
  const token = operatorLogin.body.data.session.token as string;

  const database = createDatabaseClient(testConfig);
  const store = createMonitoringStore(database);

  try {
    await database.query("delete from monitoring_disturbance_events");
    await database.query("delete from monitoring_disturbances");
    await database.query(
      "update sites set technical_status = 'offline', technical_status_updated_at = now() where id = 'site-hamburg-hafen'"
    );

    const critical = await store.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-router-hafen",
      referenceLabel: "Router uplink",
      disturbanceTypeId: "disturbance-type-router-unreachable",
      priority: "critical",
      title: "Router uplink gestoehrt",
      description: "Router antwortet nicht mehr auf Reachability-Pruefung.",
      comment: "auto-detected"
    });
    await store.appendDisturbanceEvent({
      disturbanceId: critical.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Monitoring disturbance opened."
    });
    await store.addDisturbanceNote(critical.id, {
      actorUserId: "user-operator",
      note: "Erste technische Sichtung gestartet."
    });

    const normal = await store.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-camera-yard-1",
      referenceLabel: "Kamera Yard 1",
      disturbanceTypeId: "disturbance-type-camera-unreachable",
      priority: "normal",
      title: "Kamera Yard 1 nicht erreichbar",
      description: "HTTP-Healthcheck ohne erfolgreiche Antwort."
    });
    await store.appendDisturbanceEvent({
      disturbanceId: normal.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Monitoring disturbance opened."
    });

    const openResponse = await apiRequest("/api/v1/monitoring/disturbances/open?siteTechnicalStatus=offline", {
      method: "GET",
      token
    });
    assert.equal(openResponse.status, 200);
    assert.equal(openResponse.body.data.items.length, 2);
    assert.equal(openResponse.body.data.items[0].id, critical.id);
    assert.equal(openResponse.body.data.items[0].priority, "critical");
    assert.equal(openResponse.body.data.items[0].siteTechnicalStatus, "offline");
    assert.equal(openResponse.body.data.items[0].isOfflineRelated, true);

    const detailResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}`, {
      method: "GET",
      token
    });
    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.data.disturbance.id, critical.id);
    assert.equal(detailResponse.body.data.site.siteName, "Hamburg Hafen");
    assert.equal(detailResponse.body.data.device.id, "device-router-hafen");
    assert.ok(detailResponse.body.data.history.some((entry: { eventKind: string }) => entry.eventKind === "disturbance_opened"));
    assert.ok(detailResponse.body.data.notes.some((entry: { note?: string }) => entry.note === "Erste technische Sichtung gestartet."));

    const acknowledgeResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}/acknowledge`, {
      method: "POST",
      token,
      body: {
        comment: "Technik ist informiert."
      }
    });
    assert.equal(acknowledgeResponse.status, 200);
    assert.equal(acknowledgeResponse.body.data.disturbance.status, "acknowledged");

    const noteResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}/notes`, {
      method: "POST",
      token,
      body: {
        note: "VPN-Strecke und Router-Standort weiter pruefen."
      }
    });
    assert.equal(noteResponse.status, 200);
    assert.equal(noteResponse.body.data.note.eventKind, "note_added");

    const serviceCaseResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}/service-cases`, {
      method: "POST",
      token,
      body: {
        comment: "Stoerung lokal nicht behebbar, Serviceeinsatz noetig."
      }
    });
    assert.equal(serviceCaseResponse.status, 200);
    assert.equal(serviceCaseResponse.body.data.serviceCase.disturbanceId, critical.id);
    assert.equal(serviceCaseResponse.body.data.serviceCase.status, "open");

    const updatedDetailResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}`, {
      method: "GET",
      token
    });
    assert.equal(updatedDetailResponse.status, 200);
    assert.equal(updatedDetailResponse.body.data.disturbance.status, "acknowledged");
    assert.equal(updatedDetailResponse.body.data.serviceCase.status, "open");
    assert.ok(updatedDetailResponse.body.data.history.some((entry: { eventKind: string; status?: string }) => entry.eventKind === "status_changed" && entry.status === "acknowledged"));
    assert.ok(updatedDetailResponse.body.data.history.some((entry: { eventKind: string }) => entry.eventKind === "service_case_created"));
    assert.ok(updatedDetailResponse.body.data.notes.some((entry: { note?: string }) => entry.note === "VPN-Strecke und Router-Standort weiter pruefen."));

    const duplicateServiceCaseResponse = await apiRequest(`/api/v1/monitoring/disturbances/${critical.id}/service-cases`, {
      method: "POST",
      token,
      body: {
        comment: "Darf nicht erneut angelegt werden."
      }
    });
    assert.equal(duplicateServiceCaseResponse.status, 409);
    assert.equal(duplicateServiceCaseResponse.body.code, "MONITORING_SERVICE_CASE_ALREADY_EXISTS");

    const invalidQueryResponse = await apiRequest("/api/v1/monitoring/disturbances/open?priority=urgent", {
      method: "GET",
      token
    });
    assert.equal(invalidQueryResponse.status, 400);
    assert.equal(invalidQueryResponse.body.code, "HTTP_QUERY_VALIDATION_FAILED");

    const auditCount = await database.query<{ total: string }>(
      "select count(*)::text as total from audit_events where category in ('monitoring.pipeline', 'monitoring.disturbance')"
    );
    assert.ok(Number(auditCount.rows[0]?.total ?? "0") >= 4);
  } finally {
    await database.close();
  }
});

test("smoke flow covers site geo coordinates and derived map markers", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const database = createDatabaseClient(testConfig);
  const store = createMonitoringStore(database);

  try {
    await database.query("delete from monitoring_disturbance_events");
    await database.query("delete from monitoring_service_cases");
    await database.query("delete from monitoring_disturbances");
    await database.query("delete from alarm_assignments");
    await database.query("delete from alarm_media");
    await database.query("delete from alarm_events");
    await database.query("delete from alarm_cases");
    await database.query(
      "update sites set technical_status = 'ok', technical_status_updated_at = now() where id = 'site-hamburg-hafen'"
    );

    const ingestionResponse = await apiRequest("/api/v1/alarm-ingestion", {
      method: "POST",
      body: {
        siteId: "site-hamburg-hafen",
        primaryDeviceId: "device-camera-yard-1",
        alarmType: "motion",
        priority: "high",
        title: "Map marker smoke case"
      }
    });
    assert.equal(ingestionResponse.status, 200);

    const disturbance = await store.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-router-hafen",
      referenceLabel: "Router uplink",
      disturbanceTypeId: "disturbance-type-router-unreachable",
      priority: "critical",
      title: "Router uplink gestoert"
    });
    await store.appendDisturbanceEvent({
      disturbanceId: disturbance.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Monitoring disturbance opened."
    });

    const markersResponse = await apiRequest("/api/v1/map/site-markers", {
      method: "GET",
      token
    });
    assert.equal(markersResponse.status, 200);
    assert.equal(markersResponse.body.data.siteMarkers.regionHint, "dach");

    const marker = markersResponse.body.data.siteMarkers.markers.find((entry: { siteId: string }) => entry.siteId === "site-hamburg-hafen");
    assert.ok(marker);
    assert.equal(marker.siteName, "Hamburg Hafen");
    assert.equal(marker.latitude, 53.543682);
    assert.equal(marker.longitude, 9.966271);
    assert.equal(marker.technicalStatus.overallStatus, "ok");
    assert.equal(marker.hasOpenAlarm, true);
    assert.equal(marker.hasOpenDisturbance, true);
    assert.ok(marker.openAlarmCount >= 1);
    assert.ok(marker.openDisturbanceCount >= 1);
  } finally {
    await database.close();
  }
});

test("smoke flow exposes site plans and camera markers in master-data overview", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const overviewResponse = await apiRequest("/api/v1/master-data/overview", {
    method: "GET",
    token
  });
  assert.equal(overviewResponse.status, 200);

  const site = overviewResponse.body.data.overview.sites.find((entry: { id: string }) => entry.id === "site-hamburg-hafen");
  assert.ok(site);
  const plan = site.plans.find((entry: { id: string }) => entry.id === "plan-yard-overview");
  assert.ok(plan);
  assert.equal(plan.kind, "site_plan");
  assert.equal(plan.assetName, "yard-overview.png");
  assert.ok(plan.markers.length >= 1);
  assert.ok(plan.markers.some((entry: { id: string; markerType: string; deviceId?: string }) =>
    entry.id === "marker-yard-cam-1" && entry.markerType === "camera" && entry.deviceId === "device-camera-yard-1"
  ));
});

test("smoke flow covers dashboard metrics and operational highlights", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const leitungLoginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "leitung",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(leitungLoginResponse.status, 200);

  const database = createDatabaseClient(testConfig);
  const store = createMonitoringStore(database);

  try {
    await database.query("delete from monitoring_disturbance_events");
    await database.query("delete from monitoring_service_cases");
    await database.query("delete from monitoring_disturbances");
    await database.query("delete from alarm_assignments");
    await database.query("delete from alarm_media");
    await database.query("delete from alarm_events");
    await database.query("delete from alarm_case_false_positive_reasons");
    await database.query("delete from alarm_case_comments");
    await database.query("delete from alarm_case_actions");
    await database.query("delete from alarm_cases");
    await database.query(
      "update sites set technical_status = 'offline', technical_status_updated_at = now() where id = 'site-hamburg-hafen'"
    );

    const ingestionResponse = await apiRequest("/api/v1/alarm-ingestion", {
      method: "POST",
      body: {
        siteId: "site-hamburg-hafen",
        primaryDeviceId: "device-camera-yard-1",
        alarmType: "motion",
        priority: "critical",
        title: "Dashboard smoke alarm"
      }
    });
    assert.equal(ingestionResponse.status, 200);
    const alarmCaseId = ingestionResponse.body.data.alarmCase.id as string;

    const assessmentResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/assessment`, {
      method: "POST",
      token,
      body: {
        assessmentStatus: "false_positive",
        falsePositiveReasonIds: ["fp-environmental"]
      }
    });
    assert.equal(assessmentResponse.status, 200);

    const disturbance = await store.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-router-hafen",
      referenceLabel: "Standort uplink",
      disturbanceTypeId: "disturbance-type-site-connection",
      priority: "critical",
      title: "Dashboard smoke disturbance"
    });
    await store.appendDisturbanceEvent({
      disturbanceId: disturbance.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Monitoring disturbance opened."
    });

    const dashboardResponse = await apiRequest("/api/v1/dashboard/overview", {
      method: "GET",
      token
    });
    assert.equal(dashboardResponse.status, 200);

    const overview = dashboardResponse.body.data.overview;
    assert.ok(overview.metrics.openAlarms.value >= 1);
    assert.ok(overview.metrics.openDisturbances.value >= 1);
    assert.ok(overview.metrics.todaysFalsePositives.value >= 1);
    assert.ok(overview.metrics.criticalSites.value >= 1);
    assert.ok(overview.metrics.activeOperators.value >= 2);
    assert.ok(overview.highlights.alarms.some((entry: { id: string }) => entry.id === alarmCaseId));
    assert.ok(overview.highlights.disturbances.some((entry: { id: string }) => entry.id === disturbance.id));
    assert.ok(overview.highlights.criticalSites.some((entry: { siteId: string }) => entry.siteId === "site-hamburg-hafen"));
    assert.ok(overview.highlights.activeOperators.some((entry: { displayName: string }) => entry.displayName === "Operator Standard"));
  } finally {
    await database.close();
  }
});

test("smoke flow covers reporting metrics, filters and durations", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const database = createDatabaseClient(testConfig);
  const monitoringStore = createMonitoringStore(database);

  try {
    await database.query("delete from monitoring_disturbance_events");
    await database.query("delete from monitoring_service_cases");
    await database.query("delete from monitoring_disturbances");
    await database.query("delete from alarm_assignments");
    await database.query("delete from alarm_media");
    await database.query("delete from alarm_events");
    await database.query("delete from alarm_case_false_positive_reasons");
    await database.query("delete from alarm_case_comments");
    await database.query("delete from alarm_case_actions");
    await database.query("delete from alarm_cases");

    const from = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const to = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const sourceOccurredAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
    const disturbanceStartedAt = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
    const disturbanceResolvedStartedAt = new Date(Date.now() - (8 * 60 * 1000)).toISOString();

    const firstAlarmResponse = await apiRequest("/api/v1/alarm-ingestion", {
      method: "POST",
      body: {
        siteId: "site-hamburg-hafen",
        primaryDeviceId: "device-camera-yard-1",
        alarmType: "motion",
        priority: "high",
        title: "Reporting false positive alarm",
        sourceOccurredAt
      }
    });
    assert.equal(firstAlarmResponse.status, 200);
    const falsePositiveAlarmId = firstAlarmResponse.body.data.alarmCase.id as string;

    const reserveFalsePositiveResponse = await apiRequest(`/api/v1/alarm-cases/${falsePositiveAlarmId}/reserve`, {
      method: "POST",
      token,
      body: {}
    });
    assert.equal(reserveFalsePositiveResponse.status, 200);

    const falsePositiveAssessmentResponse = await apiRequest(`/api/v1/alarm-cases/${falsePositiveAlarmId}/assessment`, {
      method: "POST",
      token,
      body: {
        assessmentStatus: "false_positive",
        falsePositiveReasonIds: ["fp-environmental"]
      }
    });
    assert.equal(falsePositiveAssessmentResponse.status, 200);

    for (const actionTypeId of ["action-call-police", "action-call-security", "action-call-customer"]) {
      const actionResponse = await apiRequest(`/api/v1/alarm-cases/${falsePositiveAlarmId}/actions`, {
        method: "POST",
        token,
        body: {
          actionTypeId,
          statusId: "action-status-completed",
          comment: `Dokumentiert ${actionTypeId}`
        }
      });
      assert.equal(actionResponse.status, 200);
    }

    const closeResponse = await apiRequest(`/api/v1/alarm-cases/${falsePositiveAlarmId}/close`, {
      method: "POST",
      token,
      body: {
        closureReasonId: "closure-false-positive",
        comment: "Reporting close"
      }
    });
    assert.equal(closeResponse.status, 200);

    const secondAlarmResponse = await apiRequest("/api/v1/alarm-ingestion", {
      method: "POST",
      body: {
        siteId: "site-hamburg-hafen",
        primaryDeviceId: "device-camera-yard-1",
        alarmType: "motion",
        priority: "critical",
        title: "Reporting confirmed alarm"
      }
    });
    assert.equal(secondAlarmResponse.status, 200);
    const confirmedAlarmId = secondAlarmResponse.body.data.alarmCase.id as string;

    const reserveConfirmedResponse = await apiRequest(`/api/v1/alarm-cases/${confirmedAlarmId}/reserve`, {
      method: "POST",
      token,
      body: {}
    });
    assert.equal(reserveConfirmedResponse.status, 200);

    const confirmedAssessmentResponse = await apiRequest(`/api/v1/alarm-cases/${confirmedAlarmId}/assessment`, {
      method: "POST",
      token,
      body: {
        assessmentStatus: "confirmed_incident"
      }
    });
    assert.equal(confirmedAssessmentResponse.status, 200);

    const openDisturbance = await monitoringStore.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-camera-yard-1",
      disturbanceTypeId: "disturbance-type-camera-unreachable",
      priority: "critical",
      title: "Reporting open disturbance",
      startedAt: disturbanceStartedAt
    });
    await monitoringStore.appendDisturbanceEvent({
      disturbanceId: openDisturbance.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Reporting disturbance opened."
    });

    const resolvedDisturbance = await monitoringStore.createDisturbance({
      siteId: "site-hamburg-hafen",
      deviceId: "device-router-hafen",
      disturbanceTypeId: "disturbance-type-router-unreachable",
      priority: "high",
      title: "Reporting resolved disturbance",
      startedAt: disturbanceResolvedStartedAt
    });
    await monitoringStore.appendDisturbanceEvent({
      disturbanceId: resolvedDisturbance.id,
      eventKind: "disturbance_opened",
      status: "open",
      message: "Resolved disturbance opened."
    });
    await monitoringStore.resolveDisturbance(resolvedDisturbance.id, {
      comment: "Resolved for reporting"
    });

    const reportResponse = await apiRequest(`/api/v1/reporting/overview?period=custom&dateFrom=${from}&dateTo=${to}&groupBy=site`, {
      method: "GET",
      token
    });
    assert.equal(reportResponse.status, 200);
    const overview = reportResponse.body.data.overview;
    assert.equal(overview.alarms.counts.totalAlarms.value, 2);
    assert.equal(overview.alarms.counts.confirmedIncidents.value, 1);
    assert.equal(overview.alarms.counts.falsePositives.value, 1);
    assert.equal(overview.alarms.counts.policeCalls.value, 1);
    assert.equal(overview.alarms.counts.securityServiceCalls.value, 1);
    assert.equal(overview.alarms.counts.customerContacts.value, 1);
    assert.ok(overview.alarms.durations.timeToAcceptance.sampleCount >= 1);
    assert.ok(overview.alarms.durations.timeToProcessingStart.sampleCount >= 2);
    assert.ok(overview.alarms.durations.timeToClosure.sampleCount >= 1);
    assert.ok(overview.alarms.durations.openAlarmDuration.sampleCount >= 1);
    assert.equal(overview.monitoring.counts.totalDisturbances.value, 2);
    assert.equal(overview.monitoring.counts.openCriticalDisturbances.value, 1);
    assert.ok(overview.monitoring.durations.openDisturbanceDuration.sampleCount >= 1);
    assert.ok(overview.alarms.groups.some((entry: { label: string }) => entry.label === "Hamburg Hafen"));
    assert.ok(overview.monitoring.groups.some((entry: { label: string }) => entry.label === "Hamburg Hafen"));

    const filteredResponse = await apiRequest("/api/v1/reporting/overview?period=custom&dateFrom=" + from + "&dateTo=" + to + "&cameraId=device-camera-yard-1&alarmType=motion&disturbanceType=camera_unreachable&groupBy=camera", {
      method: "GET",
      token
    });
    assert.equal(filteredResponse.status, 200);
    const filteredOverview = filteredResponse.body.data.overview;
    assert.equal(filteredOverview.filter.cameraId, "device-camera-yard-1");
    assert.equal(filteredOverview.filter.alarmType, "motion");
    assert.equal(filteredOverview.filter.disturbanceType, "camera_unreachable");
    assert.equal(filteredOverview.monitoring.counts.totalDisturbances.value, 1);
    assert.ok(filteredOverview.monitoring.groups.some((entry: { label: string }) => entry.label.includes("Yard")));
  } finally {
    await database.close();
  }
});

test("smoke flow covers shift planning, staffing visibility, notes, filters and overlap protection", async () => {
  const adminLoginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(adminLoginResponse.status, 200);
  const adminToken = adminLoginResponse.body.data.session.token as string;

  const operatorLoginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "operator",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(operatorLoginResponse.status, 200);
  const operatorToken = operatorLoginResponse.body.data.session.token as string;

  const operatorActiveResponse = await apiRequest("/api/v1/auth/status/active", {
    method: "POST",
    token: operatorToken,
    body: {}
  });
  assert.equal(operatorActiveResponse.status, 200);
  assert.equal(operatorActiveResponse.body.data.user.status, "aktiv");

  const now = Date.now();
  const runningStart = new Date(now - 60 * 60 * 1000).toISOString();
  const runningEnd = new Date(now + 60 * 60 * 1000).toISOString();
  const plannedStart = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const plannedEnd = new Date(now + 32 * 60 * 60 * 1000).toISOString();
  const customFrom = formatDateOnly(new Date(now - 24 * 60 * 60 * 1000));
  const customTo = formatDateOnly(new Date(now + 3 * 24 * 60 * 60 * 1000));

  const createRunningShiftResponse = await apiRequest("/api/v1/shift-planning/shifts", {
    method: "POST",
    token: adminToken,
    body: {
      title: "Fruehschicht Leitstelle",
      startsAt: runningStart,
      endsAt: runningEnd,
      assignmentUserIds: ["user-operator"],
      handoverNote: "Offene Rueckfragen aus der Nacht pruefen."
    }
  });
  assert.equal(createRunningShiftResponse.status, 200);

  const createPlannedShiftResponse = await apiRequest("/api/v1/shift-planning/shifts", {
    method: "POST",
    token: adminToken,
    body: {
      title: "Spaetschicht Leitstelle",
      startsAt: plannedStart,
      endsAt: plannedEnd,
      assignmentUserIds: []
    }
  });
  assert.equal(createPlannedShiftResponse.status, 200);

  const overviewResponse = await apiRequest(`/api/v1/shift-planning/overview?period=custom&dateFrom=${customFrom}&dateTo=${customTo}`, {
    method: "GET",
    token: adminToken
  });
  assert.equal(overviewResponse.status, 200);
  const overview = overviewResponse.body.data.overview;
  assert.ok(overview.shifts.some((entry: { title: string; planningState: string }) => entry.title === "Fruehschicht Leitstelle" && entry.planningState === "running"));
  assert.ok(overview.shifts.some((entry: { title: string; planningState: string; assignments: unknown[] }) => entry.title === "Spaetschicht Leitstelle" && entry.planningState === "planned" && entry.assignments.length === 0));
  const runningShift = overview.shifts.find((entry: { title: string }) => entry.title === "Fruehschicht Leitstelle");
  assert.ok(runningShift);
  assert.equal(runningShift.assignments[0].userId, "user-operator");
  assert.equal(runningShift.assignments[0].presence.currentStatus, "aktiv");
  assert.equal(runningShift.assignments[0].presence.hasActiveSession, true);
  assert.equal(runningShift.handoverNote, "Offene Rueckfragen aus der Nacht pruefen.");

  const filteredRunningResponse = await apiRequest(`/api/v1/shift-planning/overview?period=custom&dateFrom=${customFrom}&dateTo=${customTo}&planningState=running&userId=user-operator`, {
    method: "GET",
    token: adminToken
  });
  assert.equal(filteredRunningResponse.status, 200);
  assert.equal(filteredRunningResponse.body.data.overview.shifts.length, 1);
  assert.equal(filteredRunningResponse.body.data.overview.shifts[0].title, "Fruehschicht Leitstelle");

  const updatedShiftResponse = await apiRequest("/api/v1/shift-planning/shifts", {
    method: "POST",
    token: adminToken,
    body: {
      id: runningShift.id,
      title: "Fruehschicht Leitstelle",
      startsAt: runningStart,
      endsAt: runningEnd,
      assignmentUserIds: ["user-operator", "user-leitung"],
      handoverNote: "Rueckfragen und Kamera Nord priorisieren."
    }
  });
  assert.equal(updatedShiftResponse.status, 200);

  const updatedOverviewResponse = await apiRequest(`/api/v1/shift-planning/overview?period=custom&dateFrom=${customFrom}&dateTo=${customTo}&userId=user-leitung`, {
    method: "GET",
    token: adminToken
  });
  assert.equal(updatedOverviewResponse.status, 200);
  const updatedShift = updatedOverviewResponse.body.data.overview.shifts.find((entry: { id: string }) => entry.id === runningShift.id);
  assert.ok(updatedShift);
  assert.equal(updatedShift.assignments.length, 2);
  assert.equal(updatedShift.handoverNote, "Rueckfragen und Kamera Nord priorisieren.");
  assert.equal(updatedShift.handoverNotedByUserId, "user-admin");

  const overlapResponse = await apiRequest("/api/v1/shift-planning/shifts", {
    method: "POST",
    token: adminToken,
    body: {
      title: "Konfliktschicht",
      startsAt: runningStart,
      endsAt: runningEnd,
      assignmentUserIds: ["user-operator"]
    }
  });
  assert.equal(overlapResponse.status, 409);
  assert.equal(overlapResponse.body.code, "SHIFT_PLANNING_OVERLAP");

  const operatorForbiddenResponse = await apiRequest("/api/v1/shift-planning/shifts", {
    method: "POST",
    token: operatorToken,
    body: {
      title: "Unerlaubte Operatorschicht",
      startsAt: plannedStart,
      endsAt: plannedEnd,
      assignmentUserIds: ["user-operator"]
    }
  });
  assert.equal(operatorForbiddenResponse.status, 403);
  assert.equal(operatorForbiddenResponse.body.code, "SHIFT_PLANNING_FORBIDDEN");

  const emptyResponse = await apiRequest("/api/v1/shift-planning/overview?period=custom&dateFrom=2035-01-01&dateTo=2035-01-02", {
    method: "GET",
    token: adminToken
  });
  assert.equal(emptyResponse.status, 200);
  assert.equal(emptyResponse.body.data.overview.shifts.length, 0);
});

test("smoke flow correlates grundig media bundle via generic external media ingestion", async () => {
  const loginResponse = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier: "admin",
      password: testConfig.auth.bootstrapPassword
    }
  });
  assert.equal(loginResponse.status, 200);
  const token = loginResponse.body.data.session.token as string;

  const customerResponse = await apiRequest("/api/v1/master-data/customers", {
    method: "POST",
    token,
    body: {
      name: "Grundig Bundle Kunde",
      isActive: true
    }
  });
  const customer = customerResponse.body.data.overview.customers.find((entry: { name: string }) => entry.name === "Grundig Bundle Kunde");
  assert.ok(customer);

  const siteResponse = await apiRequest("/api/v1/master-data/sites", {
    method: "POST",
    token,
    body: {
      customerId: customer.id,
      siteName: "Grundig Bundle Standort",
      status: "active",
      street: "Medienweg 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      isArchived: false,
      monitoringIntervalSeconds: 180,
      failureThreshold: 2,
      highlightCriticalDevices: true,
      defaultAlarmPriority: "high",
      defaultWorkflowProfile: "event_sensitive",
      mapLabelMode: "full"
    }
  });
  const site = siteResponse.body.data.overview.sites.find((entry: { siteName: string }) => entry.siteName === "Grundig Bundle Standort");
  assert.ok(site);

  const cameraResponse = await apiRequest("/api/v1/master-data/devices", {
    method: "POST",
    token,
    body: {
      siteId: site.id,
      name: "Grundig Kamera Nordtor",
      type: "camera",
      vendor: "Grundig",
      model: "GU-CAM",
      serialNumber: "GR-CAM-014-SN",
      status: "installed",
      isActive: true
    }
  });
  const updatedSite = cameraResponse.body.data.overview.sites.find((entry: { id: string }) => entry.id === site.id);
  const camera = updatedSite.devices.find((entry: { name: string }) => entry.name === "Grundig Kamera Nordtor");
  assert.ok(camera);

  const mappingResponse = await apiRequest("/api/v1/master-data/alarm-source-mappings", {
    method: "POST",
    token,
    body: {
      siteId: site.id,
      componentId: camera.id,
      vendor: "grundig",
      sourceType: "camera",
      externalSourceKey: "GR_CAM_014",
      channelNumber: 1,
      mediaBundleProfileKey: "three_images_one_clip",
      sortOrder: 10,
      isActive: true
    }
  });
  assert.equal(mappingResponse.status, 200);

  const alarmResponse = await apiRequest("/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera", {
    method: "POST",
    body: {
      sourceEventId: "EVT88442191",
      eventCode: "Motion",
      eventTime: "2026-04-11T14:33:21.000Z",
      siteId: site.id,
      cameraId: "GR_CAM_014",
      cameraName: "Nordtor Kamera",
      cameraSerialNumber: "GR-CAM-014-SN"
    }
  });
  assert.equal(alarmResponse.status, 200);
  const alarmCaseId = alarmResponse.body.data.alarmCase.id as string;

  const filenames = [
    "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_001.jpg",
    "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_002.jpg",
    "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_003.jpg",
    "GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__clip.mp4"
  ];
  const mimeTypes = ["image/jpeg", "image/jpeg", "image/jpeg", "video/mp4"];

  for (let index = 0; index < filenames.length; index += 1) {
    const filename = filenames[index]!;
    const mediaResponse = await apiRequest("/api/v1/alarm-media-ingestion/external", {
      method: "POST",
      body: {
        vendor: "grundig",
        sourceType: "camera",
        storageKey: `/incoming/${filename}`,
        filename,
        mimeType: mimeTypes[index]
      }
    });
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.body.data.status, "attached");
  }

  const duplicateResponse = await apiRequest("/api/v1/alarm-media-ingestion/external", {
    method: "POST",
    body: {
      vendor: "grundig",
      sourceType: "camera",
      storageKey: `/incoming/${filenames[0]}`,
      filename: filenames[0],
      mimeType: "image/jpeg"
    }
  });
  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicateResponse.body.data.status, "duplicate");

  const detailResponse = await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}`, {
    method: "GET",
    token
  });
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.data.media.length, 4);
  assert.equal(detailResponse.body.data.mediaBundles.length, 1);
  assert.equal(detailResponse.body.data.mediaBundles[0].mediaBundleProfileKey, "three_images_one_clip");
  assert.equal(detailResponse.body.data.mediaBundles[0].receivedImages, 3);
  assert.equal(detailResponse.body.data.mediaBundles[0].receivedClips, 1);
  assert.equal(detailResponse.body.data.mediaBundles[0].completenessState, "complete");
  assert.match(detailResponse.body.data.media[0].storageKey, /^\/alarms\/2026\/04\/KW15\/11\/GR_CAM_014\//);

  const orphanedResponse = await apiRequest("/api/v1/alarm-media-ingestion/external", {
    method: "POST",
    body: {
      vendor: "grundig",
      sourceType: "camera",
      storageKey: "/incoming/not-parseable.jpg",
      filename: "not-parseable.jpg",
      mimeType: "image/jpeg"
    }
  });
  assert.equal(orphanedResponse.status, 200);
  assert.equal(orphanedResponse.body.data.status, "orphaned");

  const inboxResponse = await apiRequest(`/api/v1/alarm-media-inbox?status=attached&vendor=grundig&siteId=${site.id}&limit=10`, {
    method: "GET",
    token
  });
  assert.equal(inboxResponse.status, 200);
  assert.ok(inboxResponse.body.data.inbox.items.length >= 1);
  assert.equal(inboxResponse.body.data.inbox.items[0].status, "attached");
  assert.equal(inboxResponse.body.data.inbox.items[0].vendor, "grundig");
  assert.equal(inboxResponse.body.data.inbox.filter.siteId, site.id);
});

type ApiRequestInput = {
  method: "GET" | "POST";
  token?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

async function apiRequest(path: string, input: ApiRequestInput): Promise<{ status: number; body: any }> {
  const headers = new Headers();

  if (input.token) {
    headers.set("authorization", `Bearer ${input.token}`);
  }

  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headers.set(key, value);
  }

  if (input.body) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method,
    headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {})
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function withTemporaryApp(
  config: BackendRuntimeConfig,
  work: (request: (path: string, input: ApiRequestInput) => Promise<{ status: number; body: any }>) => Promise<void>
): Promise<void> {
  const app = await createApp(config);
  const tempServer = createServer((req, res) => {
    void app.handle(req, res);
  });

  try {
    tempServer.listen(0, "127.0.0.1");
    await once(tempServer, "listening");

    const address = tempServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Temporary smoke test server address is unavailable.");
    }

    const request = async (path: string, input: ApiRequestInput): Promise<{ status: number; body: any }> => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (input.token) {
        headers.authorization = `Bearer ${input.token}`;
      }
      Object.assign(headers, input.headers ?? {});

      const init: RequestInit = {
        method: input.method,
        headers
      };
      if (input.body !== undefined) {
        init.body = JSON.stringify(input.body);
      }

      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        ...init
      });

      return {
        status: response.status,
        body: await response.json()
      };
    };

    await work(request);
  } finally {
    tempServer.close();
    await app.close();
  }
}

function formatDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
