import { randomUUID } from "node:crypto";

import { monitoringDisturbanceTypes } from "@leitstelle/contracts";
import type { DatabaseClient } from "./client.js";
import { hashPassword } from "../modules/identity/passwords.js";

type SeedUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  primaryRole: string;
  roles: string[];
  isActive: boolean;
};

export async function seedDatabase(database: DatabaseClient, bootstrapPassword: string): Promise<void> {
  const users = createSeedUsers(bootstrapPassword);

  await database.withTransaction(async (client) => {
    for (const role of ["administrator", "leitstellenleiter", "operator", "service"]) {
      await client.query(
        `
          insert into roles(role_key)
          values ($1)
          on conflict (role_key) do nothing
        `,
        [role]
      );
    }

    for (const user of users) {
      await client.query(
        `
          insert into users(
            id, username, email, display_name, password_hash, primary_role, is_active, current_status, last_status_change_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'offline', now(), now())
          on conflict (id) do update set
            username = excluded.username,
            email = excluded.email,
            display_name = excluded.display_name,
            password_hash = excluded.password_hash,
            primary_role = excluded.primary_role,
            is_active = excluded.is_active,
            updated_at = now()
        `,
        [user.id, user.username, user.email, user.displayName, user.passwordHash, user.primaryRole, user.isActive]
      );

      await client.query("delete from user_roles where user_id = $1", [user.id]);

      for (const role of user.roles) {
        await client.query(
          `
            insert into user_roles(user_id, role_key)
            values ($1, $2)
            on conflict (user_id, role_key) do nothing
          `,
          [user.id, role]
        );
      }

      await client.query(
        `
          insert into user_status_history(id, user_id, status, changed_at)
          values ($1, $2, 'offline', now())
          on conflict do nothing
        `,
        [randomUUID(), user.id]
      );
    }

    await client.query(
      `
        insert into global_settings(
          id, monitoring_interval_seconds, failure_threshold, ui_density, escalation_profile, workflow_profile, password_min_length, kiosk_code_length, updated_at
        )
        values (1, 90, 3, 'comfortable', 'standard', 'default', 8, 6, now())
        on conflict (id) do update set
          monitoring_interval_seconds = excluded.monitoring_interval_seconds,
          failure_threshold = excluded.failure_threshold,
          ui_density = excluded.ui_density,
          escalation_profile = excluded.escalation_profile,
          workflow_profile = excluded.workflow_profile,
          password_min_length = excluded.password_min_length,
          kiosk_code_length = excluded.kiosk_code_length,
          updated_at = now()
      `
    );

    const falsePositiveReasons = [
      ["fp-environmental", "environmental_trigger", "Umwelt-/Umgebungseinfluss", "Witterung, Licht oder andere Umgebungseffekte.", 10],
      ["fp-animal", "animal_trigger", "Tierausloesung", "Tierbewegung oder tierbedingte Ausloesung.", 20],
      ["fp-maintenance", "maintenance_activity", "Wartung/Test", "Geplante Wartung, Test oder Inbetriebnahme.", 30]
    ] as const;

    for (const [id, code, label, description, sortOrder] of falsePositiveReasons) {
      await client.query(
        `
          insert into alarm_false_positive_reasons(id, code, label, description, is_active, sort_order)
          values ($1, $2, $3, $4, true, $5)
          on conflict (id) do update set
            code = excluded.code,
            label = excluded.label,
            description = excluded.description,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order
        `,
        [id, code, label, description, sortOrder]
      );
    }

    const closureReasons = [
      ["closure-incident-handled", "incident_handled", "Vorfall bearbeitet", "Operativer Vorfall wurde bearbeitet.", 10],
      ["closure-false-positive", "false_positive_verified", "Fehlalarm bestaetigt", "Alarm wurde als Fehlalarm abgeschlossen.", 20],
      ["closure-technical-resolved", "technical_issue_resolved", "Technische Stoerung behoben", "Technische Stoerung wurde abgeschlossen.", 30]
    ] as const;

    for (const [id, code, label, description, sortOrder] of closureReasons) {
      await client.query(
        `
          insert into alarm_closure_reasons(id, code, label, description, is_active, sort_order)
          values ($1, $2, $3, $4, true, $5)
          on conflict (id) do update set
            code = excluded.code,
            label = excluded.label,
            description = excluded.description,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order
        `,
        [id, code, label, description, sortOrder]
      );
    }

    const actionTypes = [
      ["action-call-police", "call_police", "Polizei anrufen", "Telefonische Alarmierung der Polizei.", 10],
      ["action-call-security", "call_security_service", "Sicherheitsdienst anrufen", "Telefonische Alarmierung des Sicherheitsdienstes.", 20],
      ["action-call-customer", "call_customer", "Kunde anrufen", "Telefonische Ruecksprache mit dem Kunden.", 30],
      ["action-speaker-live", "speaker_live_announcement", "Lautsprecher Live-Ansage", "Manuelle Live-Durchsage ueber den Lautsprecher.", 40],
      ["action-speaker-canned", "speaker_pre_recorded_announcement", "Lautsprecher Konservenansage", "Vordefinierte Lautsprecheransage abspielen.", 50]
    ] as const;

    for (const [id, code, label, description, sortOrder] of actionTypes) {
      await client.query(
        `
          insert into alarm_action_types(id, code, label, description, is_active, sort_order)
          values ($1, $2, $3, $4, true, $5)
          on conflict (id) do update set
            code = excluded.code,
            label = excluded.label,
            description = excluded.description,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order
        `,
        [id, code, label, description, sortOrder]
      );
    }

    const actionStatuses = [
      ["action-status-pending", "pending", "Ausstehend", "Massnahme ist vorbereitet, aber noch nicht begonnen.", 10],
      ["action-status-in-progress", "in_progress", "In Bearbeitung", "Massnahme wird gerade ausgefuehrt.", 20],
      ["action-status-completed", "completed", "Erfolgreich abgeschlossen", "Massnahme wurde erfolgreich abgeschlossen.", 30],
      ["action-status-failed", "failed", "Fehlgeschlagen", "Massnahme konnte nicht erfolgreich abgeschlossen werden.", 40],
      ["action-status-not-reachable", "not_reachable", "Nicht erreichbar", "Zielperson oder Stelle war nicht erreichbar.", 50],
      ["action-status-not-required", "not_required", "Nicht erforderlich", "Massnahme war fuer diesen Fall nicht erforderlich.", 60]
    ] as const;

    for (const [id, code, label, description, sortOrder] of actionStatuses) {
      await client.query(
        `
          insert into alarm_action_statuses(id, code, label, description, is_active, sort_order)
          values ($1, $2, $3, $4, true, $5)
          on conflict (id) do update set
            code = excluded.code,
            label = excluded.label,
            description = excluded.description,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order
        `,
        [id, code, label, description, sortOrder]
      );
    }

    const disturbanceTypes: Array<[string, (typeof monitoringDisturbanceTypes)[number], string, string, "normal" | "high" | "critical", number]> = [
      [
        "disturbance-type-router-unreachable",
        "router_unreachable",
        "Router nicht erreichbar",
        "Router oder WAN-Gateway des Standorts ist technisch nicht erreichbar.",
        "high",
        10
      ],
      [
        "disturbance-type-nvr-unreachable",
        "nvr_unreachable",
        "NVR nicht erreichbar",
        "Netzwerkrekorder des Standorts ist nicht erreichbar.",
        "high",
        20
      ],
      [
        "disturbance-type-camera-unreachable",
        "camera_unreachable",
        "Kamera nicht erreichbar",
        "Einzelne Kamera oder Kamerakanal ist technisch nicht erreichbar.",
        "normal",
        30
      ],
      [
        "disturbance-type-site-connection",
        "site_connection_disturbed",
        "Standort / Verbindung gestoert",
        "Die Standortanbindung oder die Standortverbindung ist gestoert.",
        "critical",
        40
      ],
      [
        "disturbance-type-technical-alarm",
        "technical_alarm",
        "Technisch bedingter Alarm",
        "Technischer Alarm oder technischer Fehlerfall ohne direkte Fachklassifikation.",
        "normal",
        50
      ],
      [
        "disturbance-type-other-disturbance",
        "other_disturbance",
        "Sonstige Stoerung",
        "Sonstige technische Stoerung ohne genauere Standardklassifikation.",
        "normal",
        60
      ]
    ];

    for (const [id, code, label, description, defaultPriority, sortOrder] of disturbanceTypes) {
      await client.query(
        `
          insert into monitoring_disturbance_types(id, code, label, description, default_priority, is_active, sort_order)
          values ($1, $2, $3, $4, $5, true, $6)
          on conflict (id) do update set
            code = excluded.code,
            label = excluded.label,
            description = excluded.description,
            default_priority = excluded.default_priority,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order,
            updated_at = now()
        `,
        [id, code, label, description, defaultPriority, sortOrder]
      );
    }

    const customerId = "customer-nordlicht-security";
    const siteId = "site-hamburg-hafen";
    const cameraId = "device-camera-yard-1";

    await client.query(
      `
        insert into customers(id, name, external_ref, is_active)
        values ($1, $2, $3, true)
        on conflict (id) do update set
          name = excluded.name,
          external_ref = excluded.external_ref,
          is_active = excluded.is_active
      `,
      [customerId, "Nordlicht Security GmbH", "NORD-001"]
    );

    await client.query(
      `
        insert into sites(
          id, customer_id, site_name, status, technical_status, technical_status_updated_at, street, postal_code, city, country, latitude, longitude, is_archived
        )
        values ($1, $2, $3, 'active', 'ok', now(), 'Kaiweg 12', '20457', 'Hamburg', 'DE', 53.543682, 9.966271, false)
        on conflict (id) do update set
          customer_id = excluded.customer_id,
          site_name = excluded.site_name,
          status = excluded.status,
          technical_status = excluded.technical_status,
          technical_status_updated_at = excluded.technical_status_updated_at,
          street = excluded.street,
          postal_code = excluded.postal_code,
          city = excluded.city,
          country = excluded.country,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          is_archived = excluded.is_archived
      `,
      [siteId, customerId, "Hamburg Hafen"]
    );

    await client.query(
      `
        insert into site_settings(
          site_id, monitoring_interval_seconds, failure_threshold, highlight_critical_devices,
          default_alarm_priority, default_workflow_profile, map_label_mode
        )
        values ($1, 120, 4, true, 'high', 'event_sensitive', 'full')
        on conflict (site_id) do update set
          monitoring_interval_seconds = excluded.monitoring_interval_seconds,
          failure_threshold = excluded.failure_threshold,
          highlight_critical_devices = excluded.highlight_critical_devices,
          default_alarm_priority = excluded.default_alarm_priority,
          default_workflow_profile = excluded.default_workflow_profile,
          map_label_mode = excluded.map_label_mode
      `,
      [siteId]
    );

    await client.query(
      `
        insert into alarm_workflow_profiles(
          id, site_id, code, label, description, time_context, special_context_label, is_active, sort_order, active_from_time, active_to_time
        )
        values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9::time, $10::time)
        on conflict (id) do update set
          site_id = excluded.site_id,
          code = excluded.code,
          label = excluded.label,
          description = excluded.description,
          time_context = excluded.time_context,
          special_context_label = excluded.special_context_label,
          is_active = excluded.is_active,
          sort_order = excluded.sort_order,
          active_from_time = excluded.active_from_time,
          active_to_time = excluded.active_to_time,
          updated_at = now()
      `,
      [
        "workflow-site-hamburg-standard",
        siteId,
        "hamburg_hafen_standard",
        "Hamburg Hafen Standard",
        "Grundcheckliste fuer operative Bearbeitung am Standort Hamburg Hafen.",
        "normal",
        null,
        10,
        "18:00:00",
        "06:00:00"
      ]
    );

    await client.query(
      `
        insert into alarm_workflow_profiles(
          id, site_id, code, label, description, time_context, special_context_label, is_active, sort_order, active_from_time, active_to_time
        )
        values ($1, $2, $3, $4, $5, $6, $7, true, $8, null, null)
        on conflict (id) do update set
          site_id = excluded.site_id,
          code = excluded.code,
          label = excluded.label,
          description = excluded.description,
          time_context = excluded.time_context,
          special_context_label = excluded.special_context_label,
          is_active = excluded.is_active,
          sort_order = excluded.sort_order,
          active_from_time = excluded.active_from_time,
          active_to_time = excluded.active_to_time,
          updated_at = now()
      `,
      [
        "workflow-site-hamburg-weekend",
        siteId,
        "hamburg_hafen_weekend",
        "Hamburg Hafen Wochenende",
        "Wochenend-Checkliste fuer reduzierte Personaldecke und erhoehte Rueckrufpflicht.",
        "weekend",
        null,
        20
      ]
    );

    await client.query(
      `
        insert into alarm_workflow_profiles(
          id, site_id, code, label, description, time_context, special_context_label, is_active, sort_order, active_from_time, active_to_time
        )
        values ($1, $2, $3, $4, $5, $6, $7, true, $8, null, null)
        on conflict (id) do update set
          site_id = excluded.site_id,
          code = excluded.code,
          label = excluded.label,
          description = excluded.description,
          time_context = excluded.time_context,
          special_context_label = excluded.special_context_label,
          is_active = excluded.is_active,
          sort_order = excluded.sort_order,
          active_from_time = excluded.active_from_time,
          active_to_time = excluded.active_to_time,
          updated_at = now()
      `,
      [
        "workflow-site-hamburg-special",
        siteId,
        "hamburg_hafen_special",
        "Hamburg Hafen Sonderlage Sturm",
        "Sonderlage fuer Unwetter oder Hafensturm.",
        "special",
        "storm_mode",
        30
      ]
    );

    const workflowSteps = [
      [
        "workflow-step-hamburg-call-customer",
        "workflow-site-hamburg-standard",
        "inform_customer",
        "Kundenkontakt herstellen",
        "Kundenkontakt gemaess Eskalationsliste herstellen und Erreichbarkeit pruefen.",
        10,
        true,
        "action-call-customer",
        null,
        null
      ],
      [
        "workflow-step-hamburg-call-security",
        "workflow-site-hamburg-standard",
        "inform_security",
        "Sicherheitsdienst informieren",
        "Sicherheitsdienst telefonisch informieren, falls Lage vor Ort zu pruefen ist.",
        20,
        false,
        "action-call-security",
        null,
        null
      ],
      [
        "workflow-step-hamburg-speaker-night",
        "workflow-site-hamburg-standard",
        "speaker_deterrence",
        "Lautsprecheransage vorbereiten",
        "Nachts kann eine Lautsprecheransage zur Abschreckung vorbereitet werden.",
        30,
        false,
        "action-speaker-canned",
        "22:00:00",
        "06:00:00"
      ],
      [
        "workflow-step-hamburg-weekend-customer",
        "workflow-site-hamburg-weekend",
        "weekend_customer_callback",
        "Wochenend-Rueckruf Kunde",
        "Am Wochenende ist der Kunde vor externer Eskalation rueckzurufen.",
        10,
        true,
        "action-call-customer",
        null,
        null
      ],
      [
        "workflow-step-hamburg-weekend-police",
        "workflow-site-hamburg-weekend",
        "weekend_police_escalation",
        "Polizei nur lageabhaengig informieren",
        "Nur bei bestaetigter Lage oder Nichterreichbarkeit des Kunden eskalieren.",
        20,
        false,
        "action-call-police",
        null,
        null
      ],
      [
        "workflow-step-hamburg-special-security",
        "workflow-site-hamburg-special",
        "special_security_dispatch",
        "Sicherheitsdienst sofort informieren",
        "In Sonderlagen ist der Sicherheitsdienst unverzueglich zu informieren.",
        10,
        true,
        "action-call-security",
        null,
        null
      ]
    ] as const;

    for (const [id, profileId, stepCode, title, instruction, sortOrder, isRequiredByDefault, actionTypeId, activeFromTime, activeToTime] of workflowSteps) {
      await client.query(
        `
          insert into alarm_workflow_profile_steps(
            id, profile_id, step_code, title, instruction, sort_order, is_required_by_default, action_type_id, active_from_time, active_to_time
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10::time)
          on conflict (id) do update set
            profile_id = excluded.profile_id,
            step_code = excluded.step_code,
            title = excluded.title,
            instruction = excluded.instruction,
            sort_order = excluded.sort_order,
            is_required_by_default = excluded.is_required_by_default,
            action_type_id = excluded.action_type_id,
            active_from_time = excluded.active_from_time,
            active_to_time = excluded.active_to_time,
            updated_at = now()
        `,
        [id, profileId, stepCode, title, instruction, sortOrder, isRequiredByDefault, actionTypeId, activeFromTime, activeToTime]
      );
    }

    const deviceRows = [
      ["device-router-hafen", siteId, "Hafen Router", "router", "Lancom", "1900EF", "LC-1900-001", "installed", "10.12.0.1"],
      ["device-nvr-hafen", siteId, "Hafen NVR", "nvr", "Hanwha", "XRN-820S", "NVR-820-001", "installed", "10.12.0.10"],
      [cameraId, siteId, "Yard Kamera 1", "camera", "Axis", "P1468", "AX-1468-001", "installed", "10.12.0.21"],
      ["device-ptz-hafen", siteId, "Dome West", "dome_ptz_camera", "Bosch", "AUTODOME", "PTZ-01", "installed", "10.12.0.30"],
      ["device-bispectral-hafen", siteId, "Thermal Nord", "bi_spectral_camera", "Hikvision", "DS-2TD", "BI-01", "installed", "10.12.0.31"],
      ["device-speaker-hafen", siteId, "Tor Lautsprecher", "speaker", "Axis", "C1310", "SP-01", "installed", "10.12.0.41"]
    ] as const;

    for (const row of deviceRows) {
      await client.query(
        `
          insert into devices(
            id, site_id, name, type, vendor, model, serial_number, status, network_address
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (id) do update set
            site_id = excluded.site_id,
            name = excluded.name,
            type = excluded.type,
            vendor = excluded.vendor,
            model = excluded.model,
            serial_number = excluded.serial_number,
            status = excluded.status,
            network_address = excluded.network_address
        `,
        [...row]
      );
    }

    const monitoringTargets = [
      [
        "monitor-target-site-vpn",
        "site",
        siteId,
        null,
        "Standort VPN Reachability",
        "vpn",
        "10.12.0.1",
        443,
        null,
        null,
        [200],
        3000,
        false,
        "disturbance-type-site-connection",
        true,
        10
      ],
      [
        "monitor-target-router-ping",
        "device",
        siteId,
        "device-router-hafen",
        "Router Ping",
        "ping",
        "10.12.0.1",
        443,
        null,
        null,
        [200],
        3000,
        true,
        "disturbance-type-router-unreachable",
        true,
        20
      ],
      [
        "monitor-target-nvr-http",
        "device",
        siteId,
        "device-nvr-hafen",
        "NVR HTTP Health",
        "http",
        "http://10.12.0.10:8080",
        null,
        "/health",
        "GET",
        [200],
        3000,
        true,
        "disturbance-type-nvr-unreachable",
        true,
        30
      ],
      [
        "monitor-target-camera-api",
        "device",
        siteId,
        cameraId,
        "Kamera API Heartbeat",
        "api",
        "http://10.12.0.21:8081",
        null,
        "/status",
        "GET",
        [200],
        3000,
        true,
        "disturbance-type-camera-unreachable",
        true,
        40
      ],
      [
        "monitor-target-camera-onvif",
        "device",
        siteId,
        "device-ptz-hafen",
        "PTZ ONVIF Probe",
        "onvif",
        "http://10.12.0.30:8899",
        null,
        "/onvif/device_service",
        "GET",
        [200, 401],
        3000,
        true,
        "disturbance-type-camera-unreachable",
        true,
        50
      ]
    ] as const;

    for (const [
      id,
      scope,
      monitoringSiteId,
      deviceId,
      label,
      checkKind,
      endpoint,
      port,
      path,
      requestMethod,
      expectedStatusCodes,
      timeoutMs,
      requiresVpn,
      disturbanceTypeId,
      isActive,
      sortOrder
    ] of monitoringTargets) {
      await client.query(
        `
          insert into monitoring_check_targets(
            id, scope, site_id, device_id, label, check_kind, endpoint, port, path, request_method,
            expected_status_codes, timeout_ms, requires_vpn, disturbance_type_id, is_active, sort_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::integer[], $12, $13, $14, $15, $16)
          on conflict (id) do update set
            scope = excluded.scope,
            site_id = excluded.site_id,
            device_id = excluded.device_id,
            label = excluded.label,
            check_kind = excluded.check_kind,
            endpoint = excluded.endpoint,
            port = excluded.port,
            path = excluded.path,
            request_method = excluded.request_method,
            expected_status_codes = excluded.expected_status_codes,
            timeout_ms = excluded.timeout_ms,
            requires_vpn = excluded.requires_vpn,
            disturbance_type_id = excluded.disturbance_type_id,
            is_active = excluded.is_active,
            sort_order = excluded.sort_order,
            updated_at = now()
        `,
        [
          id,
          scope,
          monitoringSiteId,
          deviceId,
          label,
          checkKind,
          endpoint,
          port,
          path,
          requestMethod,
          expectedStatusCodes,
          timeoutMs,
          requiresVpn,
          disturbanceTypeId,
          isActive,
          sortOrder
        ]
      );
    }

    await upsertCredentialWithRoles(
      client,
      {
        id: "cred-site-hamburg-vpn",
        scope: "site",
        siteId,
        label: "Standort VPN",
        username: "hh-hafen-vpn",
        passwordSecret: "change-me",
        notes: null
      },
      ["administrator", "leitstellenleiter", "service"]
    );

    await upsertCredentialWithRoles(
      client,
      {
        id: "cred-router-hafen",
        scope: "device",
        deviceId: "device-router-hafen",
        label: "Admin Login",
        username: "router-admin",
        passwordSecret: "change-me",
        notes: null
      },
      ["administrator", "service"]
    );

    await upsertCredentialWithRoles(
      client,
      {
        id: "cred-nvr-hafen",
        scope: "device",
        deviceId: "device-nvr-hafen",
        label: "Recorder Login",
        username: "nvr-service",
        passwordSecret: "change-me",
        notes: null
      },
      ["administrator", "leitstellenleiter", "service"]
    );

    await client.query(
      `
        insert into site_plans(id, site_id, name, kind, asset_name)
        values ('plan-yard-overview', $1, 'Yard Uebersicht', 'site_plan', 'yard-overview.png')
        on conflict (id) do update set
          site_id = excluded.site_id,
          name = excluded.name,
          kind = excluded.kind,
          asset_name = excluded.asset_name
      `,
      [siteId]
    );

    await client.query(
      `
        insert into plan_markers(id, plan_id, label, x, y, device_id, marker_type)
        values ('marker-yard-cam-1', 'plan-yard-overview', 'Kamera Nord', 34, 58, $1, 'camera')
        on conflict (id) do update set
          plan_id = excluded.plan_id,
          label = excluded.label,
          x = excluded.x,
          y = excluded.y,
          device_id = excluded.device_id,
          marker_type = excluded.marker_type
      `,
      [cameraId]
    );
  });
}

async function upsertCredentialWithRoles(
  client: { query: (sql: string, values?: readonly unknown[]) => Promise<unknown> },
  credential: {
    id: string;
    scope: "site" | "device";
    siteId?: string;
    deviceId?: string;
    label: string;
    username: string;
    passwordSecret: string;
    notes: string | null;
  },
  visibleRoles: string[]
): Promise<void> {
  await client.query(
    `
      insert into technical_credentials(
        id, scope, site_id, device_id, label, username, password_secret, notes
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (id) do update set
        scope = excluded.scope,
        site_id = excluded.site_id,
        device_id = excluded.device_id,
        label = excluded.label,
        username = excluded.username,
        password_secret = excluded.password_secret,
        notes = excluded.notes
    `,
    [
      credential.id,
      credential.scope,
      credential.siteId ?? null,
      credential.deviceId ?? null,
      credential.label,
      credential.username,
      credential.passwordSecret,
      credential.notes
    ]
  );

  await client.query("delete from technical_credential_role_visibility where credential_id = $1", [credential.id]);

  for (const role of visibleRoles) {
    await client.query(
      `
        insert into technical_credential_role_visibility(credential_id, role_key)
        values ($1, $2)
        on conflict (credential_id, role_key) do nothing
      `,
      [credential.id, role]
    );
  }
}

function createSeedUsers(bootstrapPassword: string): SeedUser[] {
  const passwordHash = hashPassword(bootstrapPassword);

  return [
    {
      id: "user-admin",
      username: "admin",
      email: "admin@leitstelle.local",
      displayName: "Admin Standard",
      passwordHash,
      primaryRole: "administrator",
      roles: ["administrator", "leitstellenleiter"],
      isActive: true
    },
    {
      id: "user-leitung",
      username: "leitung",
      email: "leitung@leitstelle.local",
      displayName: "Leitstellenleitung",
      passwordHash,
      primaryRole: "leitstellenleiter",
      roles: ["leitstellenleiter", "operator"],
      isActive: true
    },
    {
      id: "user-operator",
      username: "operator",
      email: "operator@leitstelle.local",
      displayName: "Operator Standard",
      passwordHash,
      primaryRole: "operator",
      roles: ["operator"],
      isActive: true
    },
    {
      id: "user-service",
      username: "service",
      email: "service@leitstelle.local",
      displayName: "Service Standard",
      passwordHash,
      primaryRole: "service",
      roles: ["service"],
      isActive: true
    }
  ];
}
