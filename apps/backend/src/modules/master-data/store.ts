/**
 * Persistiert Kunden-, Standort-, Geraete- und Plan-Stammdaten in PostgreSQL.
 */
import { randomUUID } from "node:crypto";

import type {
  AlarmSourceMappingRecord,
  AlarmSourceMappingUpsertInput,
  CredentialView,
  CustomerRecord,
  CustomerUpsertInput,
  DeviceUpsertInput,
  GlobalMasterDataSettings,
  GlobalSettingsUpdateInput,
  MasterDataOverview,
  PlanUpsertInput,
  SiteDevice,
  SiteMapMarkerCollection,
  SitePlan,
  SiteRecord,
  SiteTechnicalStatusRecord,
  SiteUpsertInput,
  TechnicalCredential,
  UserRole
} from "@leitstelle/contracts";
import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { CustomerEntity, DeviceEntity, MasterDataStore, PlanEntity, SiteEntity } from "./types.js";

type GlobalSettingsRow = {
  monitoring_interval_seconds: number;
  failure_threshold: number;
  ui_density: "compact" | "comfortable";
  escalation_profile: "standard" | "elevated";
  workflow_profile: "default" | "weekend_sensitive";
  password_min_length: number;
  kiosk_code_length: number;
};

type CustomerRow = {
  id: string;
  name: string;
  external_ref: string | null;
  is_active: boolean;
};

type SiteRow = {
  id: string;
  customer_id: string;
  site_name: string;
  internal_reference: string | null;
  description: string | null;
  status: SiteRecord["status"];
  technical_status: SiteTechnicalStatusRecord["overallStatus"];
  technical_status_updated_at: string;
  street: string;
  house_number: string | null;
  postal_code: string;
  city: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
  site_type: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_archived: boolean;
  monitoring_interval_seconds: number;
  failure_threshold: number;
  highlight_critical_devices: boolean;
  default_alarm_priority: SiteRecord["settings"]["defaultAlarmPriority"];
  default_workflow_profile: SiteRecord["settings"]["defaultWorkflowProfile"];
  map_label_mode: SiteRecord["settings"]["mapLabelMode"];
};

type DeviceRow = {
  id: string;
  site_id: string;
  name: string;
  type: SiteDevice["type"];
  vendor: string | null;
  model: string | null;
  serial_number: string | null;
  status: SiteDevice["status"];
  is_active: boolean;
  network_address: string | null;
  live_view_url: string | null;
  mac_address: string | null;
  external_device_id: string | null;
  linked_nvr_device_id: string | null;
  channel_number: number | null;
  zone: string | null;
  viewing_direction: string | null;
  mount_location: string | null;
  analytics_name: string | null;
  rule_name: string | null;
  storage_label: string | null;
  wan_ip: string | null;
  lan_ip: string | null;
  vpn_type: string | null;
  provider: string | null;
  sim_identifier: string | null;
  audio_zone: string | null;
  supports_paging: boolean | null;
};

type AlarmSourceMappingRow = {
  id: string;
  site_id: string;
  component_id: string;
  nvr_component_id: string | null;
  vendor: string;
  source_type: string;
  external_source_key: string | null;
  external_device_id: string | null;
  external_recorder_id: string | null;
  channel_number: number | null;
  serial_number: string | null;
  analytics_name: string | null;
  event_namespace: string | null;
  media_bundle_profile_key: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type PlanRow = {
  id: string;
  site_id: string;
  name: string;
  kind: SitePlan["kind"];
  asset_name: string;
};

type MarkerRow = {
  id: string;
  plan_id: string;
  label: string;
  x: string;
  y: string;
  device_id: string | null;
  marker_type: SitePlan["markers"][number]["markerType"];
};

type CredentialRow = {
  id: string;
  scope: "site" | "device";
  site_id: string | null;
  device_id: string | null;
  label: string;
  username: string;
  password_secret: string;
  notes: string | null;
  visible_roles: string[];
};

type SiteMapMarkerRow = {
  site_id: string;
  site_name: string;
  customer_id: string;
  customer_name: string;
  latitude: string;
  longitude: string;
  technical_status: SiteTechnicalStatusRecord["overallStatus"];
  technical_status_updated_at: string;
  open_alarm_count: string;
  open_disturbance_count: string;
};

const archivedSiteReadRoles: UserRole[] = ["administrator", "leitstellenleiter"];

export function createMasterDataStore(database: DatabaseClient): MasterDataStore {
  return {
    async getOverview(roles) {
      const [globalSettings, customers, sites, devices, plans, markers, credentials, alarmSourceMappings] = await Promise.all([
        loadGlobalSettings(database),
        loadCustomers(database),
        loadSites(database),
        loadDevices(database),
        loadPlans(database),
        loadMarkers(database),
        loadCredentials(database),
        loadAlarmSourceMappings(database)
      ]);
      const visibleSites = roles.some((role) => archivedSiteReadRoles.includes(role))
        ? sites
        : sites.filter((site) => !site.is_archived);

      const customerById = new Map(customers.map((customer) => [customer.id, customer] as const));
      const credentialsBySiteId = groupBy(credentials.filter((credential) => credential.site_id), (entry) => entry.site_id!);
      const credentialsByDeviceId = groupBy(credentials.filter((credential) => credential.device_id), (entry) => entry.device_id!);
      const devicesBySiteId = groupBy(devices, (device) => device.site_id);
      const plansBySiteId = groupBy(plans, (plan) => plan.site_id);
      const markersByPlanId = groupBy(markers, (marker) => marker.plan_id);
      const mappingsBySiteId = groupBy(alarmSourceMappings, (mapping) => mapping.site_id);

      return {
        globalSettings,
        customers,
        sites: visibleSites.map((site) => {
          const customer = customerById.get(site.customer_id);

          if (!customer) {
            throw new AppError("Customer for site is missing.", {
              status: 500,
              code: "MASTER_CUSTOMER_INCONSISTENT"
            });
          }

          return {
            ...toSiteRecord(site, customer, credentialsBySiteId.get(site.id) ?? [], roles),
            devices: (devicesBySiteId.get(site.id) ?? []).map((device) =>
              toDeviceRecord(device, credentialsByDeviceId.get(device.id) ?? [], roles)
            ),
            alarmSourceMappings: (mappingsBySiteId.get(site.id) ?? []).map((mapping) => toAlarmSourceMappingRecord(mapping)),
            plans: (plansBySiteId.get(site.id) ?? []).map((plan) => ({
              id: plan.id,
              siteId: plan.site_id,
              name: plan.name,
              kind: plan.kind,
              assetName: plan.asset_name,
              markers: (markersByPlanId.get(plan.id) ?? []).map((marker) => ({
                id: marker.id,
                label: marker.label,
                x: Number(marker.x),
                y: Number(marker.y),
                markerType: marker.marker_type,
                ...(marker.device_id ? { deviceId: marker.device_id } : {})
              }))
            }))
          };
        })
      };
    },
    async getSiteMarkers() {
      const result = await database.query<SiteMapMarkerRow>(
        `
          select
            s.id as site_id,
            s.site_name,
            c.id as customer_id,
            c.name as customer_name,
            s.latitude::text,
            s.longitude::text,
            s.technical_status,
            s.technical_status_updated_at::text,
            (
              select count(*)::text
              from alarm_cases ac
              where ac.site_id = s.id
                and ac.lifecycle_status in ('received', 'queued', 'reserved', 'in_progress')
            ) as open_alarm_count,
            (
              select count(*)::text
              from monitoring_disturbances md
              where md.site_id = s.id
                and md.status in ('open', 'acknowledged')
            ) as open_disturbance_count
          from sites s
          join customers c on c.id = s.customer_id
          where s.is_archived = false
            and s.latitude is not null
            and s.longitude is not null
          order by c.name asc, s.site_name asc
        `
      );

      return {
        regionHint: "dach",
        markers: result.rows.map((row) => {
          const openAlarmCount = Number(row.open_alarm_count);
          const openDisturbanceCount = Number(row.open_disturbance_count);

          return {
            siteId: row.site_id,
            siteName: row.site_name,
            customerId: row.customer_id,
            customerName: row.customer_name,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            technicalStatus: {
              overallStatus: row.technical_status,
              updatedAt: row.technical_status_updated_at
            },
            openAlarmCount,
            openDisturbanceCount,
            hasOpenAlarm: openAlarmCount > 0,
            hasOpenDisturbance: openDisturbanceCount > 0
          };
        })
      } satisfies SiteMapMarkerCollection;
    },
    async upsertCustomer(input) {
      const result = await database.query<CustomerRow>(
        `
          insert into customers(id, name, external_ref, is_active)
          values ($1, $2, $3, $4)
          on conflict (id) do update set
            name = excluded.name,
            external_ref = excluded.external_ref,
            is_active = excluded.is_active
          returning id, name, external_ref, is_active
        `,
        [input.id ?? randomUUID(), input.name.trim(), normalizeOptional(input.externalRef) ?? null, input.isActive]
      );

      return toCustomerRecord(result.rows[0]!);
    },
    async upsertSite(input) {
      await ensureCustomerExists(database, input.customerId);

      const siteId = input.id ?? randomUUID();
      await database.query(
        `
          insert into sites(
            id, customer_id, site_name, internal_reference, description, status, street, house_number,
            postal_code, city, country, latitude, longitude, site_type, contact_person, contact_phone, notes, is_archived
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          on conflict (id) do update set
            customer_id = excluded.customer_id,
            site_name = excluded.site_name,
            internal_reference = excluded.internal_reference,
            description = excluded.description,
            status = excluded.status,
            street = excluded.street,
            house_number = excluded.house_number,
            postal_code = excluded.postal_code,
            city = excluded.city,
            country = excluded.country,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            site_type = excluded.site_type,
            contact_person = excluded.contact_person,
            contact_phone = excluded.contact_phone,
            notes = excluded.notes,
            is_archived = excluded.is_archived
        `,
        [
          siteId,
          input.customerId,
          input.siteName.trim(),
          normalizeOptional(input.internalReference) ?? null,
          normalizeOptional(input.description) ?? null,
          input.status,
          input.street.trim(),
          normalizeOptional(input.houseNumber) ?? null,
          input.postalCode.trim(),
          input.city.trim(),
          input.country.trim(),
          input.latitude ?? null,
          input.longitude ?? null,
          normalizeOptional(input.siteType) ?? null,
          normalizeOptional(input.contactPerson) ?? null,
          normalizeOptional(input.contactPhone) ?? null,
          normalizeOptional(input.notes) ?? null,
          input.isArchived
        ]
      );

      await database.query(
        `
          insert into site_settings(
            site_id, monitoring_interval_seconds, failure_threshold, highlight_critical_devices,
            default_alarm_priority, default_workflow_profile, map_label_mode
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (site_id) do update set
            monitoring_interval_seconds = excluded.monitoring_interval_seconds,
            failure_threshold = excluded.failure_threshold,
            highlight_critical_devices = excluded.highlight_critical_devices,
            default_alarm_priority = excluded.default_alarm_priority,
            default_workflow_profile = excluded.default_workflow_profile,
            map_label_mode = excluded.map_label_mode
        `,
        [
          siteId,
          input.monitoringIntervalSeconds,
          input.failureThreshold,
          input.highlightCriticalDevices,
          input.defaultAlarmPriority,
          input.defaultWorkflowProfile,
          input.mapLabelMode
        ]
      );

      if (!input.id) {
        const credentialId = randomUUID();
        await database.query(
          `
            insert into technical_credentials(
              id, scope, site_id, device_id, label, username, password_secret, notes
            )
            values ($1, 'site', $2, null, $3, $4, $5, null)
          `,
          [credentialId, siteId, "VPN Gateway", `${slugify(input.siteName)}-vpn`, "change-me"]
        );

        for (const role of ["administrator", "leitstellenleiter", "service"]) {
          await database.query(
            "insert into technical_credential_role_visibility(credential_id, role_key) values ($1, $2)",
            [credentialId, role]
          );
        }
      }

      return await findSiteEntity(database, siteId);
    },
    async upsertDevice(input) {
      await ensureSiteExists(database, input.siteId);
      if (input.linkedNvrDeviceId) {
        await ensureDeviceExists(database, input.linkedNvrDeviceId);
      }

      const deviceId = input.id ?? randomUUID();
      await database.query(
        `
          insert into devices(
            id, site_id, name, type, vendor, model, serial_number, status, is_active, network_address,
            live_view_url, mac_address, external_device_id, linked_nvr_device_id, channel_number, zone, viewing_direction,
            mount_location, analytics_name, rule_name, storage_label, wan_ip, lan_ip, vpn_type,
            provider, sim_identifier, audio_zone, supports_paging
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
          on conflict (id) do update set
            site_id = excluded.site_id,
            name = excluded.name,
            type = excluded.type,
            vendor = excluded.vendor,
            model = excluded.model,
            serial_number = excluded.serial_number,
            status = excluded.status,
            is_active = excluded.is_active,
            network_address = excluded.network_address,
            live_view_url = excluded.live_view_url,
            mac_address = excluded.mac_address,
            external_device_id = excluded.external_device_id,
            linked_nvr_device_id = excluded.linked_nvr_device_id,
            channel_number = excluded.channel_number,
            zone = excluded.zone,
            viewing_direction = excluded.viewing_direction,
            mount_location = excluded.mount_location,
            analytics_name = excluded.analytics_name,
            rule_name = excluded.rule_name,
            storage_label = excluded.storage_label,
            wan_ip = excluded.wan_ip,
            lan_ip = excluded.lan_ip,
            vpn_type = excluded.vpn_type,
            provider = excluded.provider,
            sim_identifier = excluded.sim_identifier,
            audio_zone = excluded.audio_zone,
            supports_paging = excluded.supports_paging
        `,
        [
          deviceId,
          input.siteId,
          input.name.trim(),
          input.type,
          normalizeOptional(input.vendor) ?? null,
          normalizeOptional(input.model) ?? null,
          normalizeOptional(input.serialNumber) ?? null,
          input.status,
          input.isActive,
          normalizeOptional(input.networkAddress) ?? null,
          normalizeOptional(input.liveViewUrl) ?? null,
          normalizeOptional(input.macAddress) ?? null,
          normalizeOptional(input.externalDeviceId) ?? null,
          normalizeOptional(input.linkedNvrDeviceId) ?? null,
          input.channelNumber ?? null,
          normalizeOptional(input.zone) ?? null,
          normalizeOptional(input.viewingDirection) ?? null,
          normalizeOptional(input.mountLocation) ?? null,
          normalizeOptional(input.analyticsName) ?? null,
          normalizeOptional(input.ruleName) ?? null,
          normalizeOptional(input.storageLabel) ?? null,
          normalizeOptional(input.wanIp) ?? null,
          normalizeOptional(input.lanIp) ?? null,
          normalizeOptional(input.vpnType) ?? null,
          normalizeOptional(input.provider) ?? null,
          normalizeOptional(input.simIdentifier) ?? null,
          normalizeOptional(input.audioZone) ?? null,
          typeof input.supportsPaging === "boolean" ? input.supportsPaging : null
        ]
      );

      if (!input.id) {
        const credentialId = randomUUID();
        await database.query(
          `
            insert into technical_credentials(
              id, scope, site_id, device_id, label, username, password_secret, notes
            )
            values ($1, 'device', null, $2, $3, $4, $5, null)
          `,
          [credentialId, deviceId, "Technischer Zugriff", `${slugify(input.name)}-svc`, "change-me"]
        );

        for (const role of ["administrator", "leitstellenleiter", "service"]) {
          await database.query(
            "insert into technical_credential_role_visibility(credential_id, role_key) values ($1, $2)",
            [credentialId, role]
          );
        }
      }

      return await findDeviceEntity(database, deviceId);
    },
    async deleteDevice(deviceId) {
      await ensureDeviceExists(database, deviceId);
      await database.query("delete from devices where id = $1", [deviceId]);
    },
    async upsertAlarmSourceMapping(input) {
      await ensureSiteExists(database, input.siteId);
      await ensureDeviceBelongsToSite(database, input.componentId, input.siteId, "component");
      if (input.nvrComponentId) {
        await ensureDeviceBelongsToSite(database, input.nvrComponentId, input.siteId, "NVR component");
      }

      const mappingId = input.id ?? randomUUID();
      await database.query(
        `
          insert into alarm_source_mappings(
            id, site_id, component_id, nvr_component_id, vendor, source_type, external_source_key,
            external_device_id, external_recorder_id, channel_number, serial_number, analytics_name,
            event_namespace, media_bundle_profile_key, description, sort_order, is_active, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
          on conflict (id) do update set
            site_id = excluded.site_id,
            component_id = excluded.component_id,
            nvr_component_id = excluded.nvr_component_id,
            vendor = excluded.vendor,
            source_type = excluded.source_type,
            external_source_key = excluded.external_source_key,
            external_device_id = excluded.external_device_id,
            external_recorder_id = excluded.external_recorder_id,
            channel_number = excluded.channel_number,
            serial_number = excluded.serial_number,
            analytics_name = excluded.analytics_name,
            event_namespace = excluded.event_namespace,
            media_bundle_profile_key = excluded.media_bundle_profile_key,
            description = excluded.description,
            sort_order = excluded.sort_order,
            is_active = excluded.is_active,
            updated_at = now()
        `,
        [
          mappingId,
          input.siteId,
          input.componentId,
          normalizeOptional(input.nvrComponentId) ?? null,
          input.vendor.trim(),
          input.sourceType.trim(),
          normalizeOptional(input.externalSourceKey) ?? null,
          normalizeOptional(input.externalDeviceId) ?? null,
          normalizeOptional(input.externalRecorderId) ?? null,
          input.channelNumber ?? null,
          normalizeOptional(input.serialNumber) ?? null,
          normalizeOptional(input.analyticsName) ?? null,
          normalizeOptional(input.eventNamespace) ?? null,
          normalizeOptional(input.mediaBundleProfileKey) ?? null,
          normalizeOptional(input.description) ?? null,
          input.sortOrder,
          input.isActive
        ]
      );

      return await findAlarmSourceMappingEntity(database, mappingId);
    },
    async upsertPlan(input) {
      await ensureSiteExists(database, input.siteId);

      const planId = input.id ?? randomUUID();
      await database.query(
        `
          insert into site_plans(id, site_id, name, kind, asset_name)
          values ($1, $2, $3, $4, $5)
          on conflict (id) do update set
            site_id = excluded.site_id,
            name = excluded.name,
            kind = excluded.kind,
            asset_name = excluded.asset_name
        `,
        [planId, input.siteId, input.name.trim(), input.kind, input.assetName.trim()]
      );

      await database.query(
        `
          insert into plan_markers(id, plan_id, label, x, y, device_id, marker_type)
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          randomUUID(),
          planId,
          input.markerLabel.trim(),
          input.markerX,
          input.markerY,
          normalizeOptional(input.deviceId) ?? null,
          input.markerType
        ]
      );

      return await findPlanEntity(database, planId);
    },
    async updateGlobalSettings(input) {
      const result = await database.query<GlobalSettingsRow>(
        `
          insert into global_settings(
            id, monitoring_interval_seconds, failure_threshold, ui_density, escalation_profile, workflow_profile, password_min_length, kiosk_code_length, updated_at
          )
          values (1, $1, $2, $3, $4, $5, $6, $7, now())
          on conflict (id) do update set
            monitoring_interval_seconds = excluded.monitoring_interval_seconds,
            failure_threshold = excluded.failure_threshold,
            ui_density = excluded.ui_density,
            escalation_profile = excluded.escalation_profile,
            workflow_profile = excluded.workflow_profile,
            password_min_length = excluded.password_min_length,
            kiosk_code_length = excluded.kiosk_code_length,
            updated_at = now()
          returning monitoring_interval_seconds, failure_threshold, ui_density, escalation_profile, workflow_profile, password_min_length, kiosk_code_length
        `,
        [
          input.monitoringIntervalSeconds,
          input.failureThreshold,
          input.uiDensity,
          input.escalationProfile,
          input.workflowProfile,
          input.passwordMinLength,
          input.kioskCodeLength
        ]
      );

      return toGlobalSettings(result.rows[0]!);
    }
  };
}

function toCustomerRecord(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    ...(row.external_ref ? { externalRef: row.external_ref } : {})
  };
}

function toSiteRecord(site: SiteRow, customer: CustomerRecord, credentials: CredentialRow[], roles: UserRole[]): SiteRecord {
  const result: SiteRecord = {
    id: site.id,
    customer,
    siteName: site.site_name,
    address: {
      street: site.street,
      postalCode: site.postal_code,
      city: site.city,
      country: site.country
    },
    ...(site.latitude !== null && site.longitude !== null
      ? {
          coordinates: {
            latitude: Number(site.latitude),
            longitude: Number(site.longitude)
          }
        }
      : {}),
    status: site.status,
    technicalStatus: {
      overallStatus: site.technical_status,
      updatedAt: site.technical_status_updated_at
    },
    isArchived: site.is_archived,
    settings: {
      monitoringIntervalSeconds: site.monitoring_interval_seconds,
      failureThreshold: site.failure_threshold,
      highlightCriticalDevices: site.highlight_critical_devices,
      defaultAlarmPriority: site.default_alarm_priority,
      defaultWorkflowProfile: site.default_workflow_profile,
      mapLabelMode: site.map_label_mode
    },
    credentials: credentials.map((credential) => toCredentialView(credential, roles))
  };

  if (site.internal_reference) {
    result.internalReference = site.internal_reference;
  }
  if (site.description) {
    result.description = site.description;
  }
  if (site.house_number) {
    result.address.houseNumber = site.house_number;
  }
  if (site.site_type) {
    result.siteType = site.site_type;
  }
  if (site.contact_person) {
    result.contactPerson = site.contact_person;
  }
  if (site.contact_phone) {
    result.contactPhone = site.contact_phone;
  }
  if (site.notes) {
    result.notes = site.notes;
  }

  return result;
}

function toDeviceRecord(device: DeviceRow, credentials: CredentialRow[], roles: UserRole[]): SiteDevice {
  const result: SiteDevice = {
    id: device.id,
    siteId: device.site_id,
    name: device.name,
    type: device.type,
    status: device.status,
    isActive: device.is_active,
    credentials: credentials.map((credential) => toCredentialView(credential, roles))
  };

  if (device.vendor) {
    result.vendor = device.vendor;
  }
  if (device.model) {
    result.model = device.model;
  }
  if (device.serial_number) {
    result.serialNumber = device.serial_number;
  }
  if (device.network_address) {
    result.networkAddress = device.network_address;
  }
  if (device.live_view_url) {
    result.liveViewUrl = device.live_view_url;
  }
  if (device.mac_address) {
    result.macAddress = device.mac_address;
  }
  if (device.external_device_id) {
    result.externalDeviceId = device.external_device_id;
  }
  if (device.linked_nvr_device_id) {
    result.linkedNvrDeviceId = device.linked_nvr_device_id;
  }
  if (device.channel_number !== null) {
    result.channelNumber = device.channel_number;
  }
  if (device.zone) {
    result.zone = device.zone;
  }
  if (device.viewing_direction) {
    result.viewingDirection = device.viewing_direction;
  }
  if (device.mount_location) {
    result.mountLocation = device.mount_location;
  }
  if (device.analytics_name) {
    result.analyticsName = device.analytics_name;
  }
  if (device.rule_name) {
    result.ruleName = device.rule_name;
  }
  if (device.storage_label) {
    result.storageLabel = device.storage_label;
  }
  if (device.wan_ip) {
    result.wanIp = device.wan_ip;
  }
  if (device.lan_ip) {
    result.lanIp = device.lan_ip;
  }
  if (device.vpn_type) {
    result.vpnType = device.vpn_type;
  }
  if (device.provider) {
    result.provider = device.provider;
  }
  if (device.sim_identifier) {
    result.simIdentifier = device.sim_identifier;
  }
  if (device.audio_zone) {
    result.audioZone = device.audio_zone;
  }
  if (device.supports_paging !== null) {
    result.supportsPaging = device.supports_paging;
  }

  return result;
}

function toAlarmSourceMappingRecord(mapping: AlarmSourceMappingRow): AlarmSourceMappingRecord {
  const result: AlarmSourceMappingRecord = {
    id: mapping.id,
    siteId: mapping.site_id,
    componentId: mapping.component_id,
    vendor: mapping.vendor,
    sourceType: mapping.source_type,
    sortOrder: mapping.sort_order,
    isActive: mapping.is_active
  };

  if (mapping.nvr_component_id) {
    result.nvrComponentId = mapping.nvr_component_id;
  }
  if (mapping.external_source_key) {
    result.externalSourceKey = mapping.external_source_key;
  }
  if (mapping.external_device_id) {
    result.externalDeviceId = mapping.external_device_id;
  }
  if (mapping.external_recorder_id) {
    result.externalRecorderId = mapping.external_recorder_id;
  }
  if (mapping.channel_number !== null) {
    result.channelNumber = mapping.channel_number;
  }
  if (mapping.serial_number) {
    result.serialNumber = mapping.serial_number;
  }
  if (mapping.analytics_name) {
    result.analyticsName = mapping.analytics_name;
  }
  if (mapping.event_namespace) {
    result.eventNamespace = mapping.event_namespace;
  }
  if (mapping.media_bundle_profile_key) {
    result.mediaBundleProfileKey = mapping.media_bundle_profile_key as import("@leitstelle/contracts").MediaBundleProfileKey;
  }
  if (mapping.description) {
    result.description = mapping.description;
  }

  return result;
}

function toCredentialView(credential: CredentialRow, roles: UserRole[]): CredentialView {
  const isVisible = roles.some((role) => credential.visible_roles.includes(role));
  return {
    id: credential.id,
    scope: credential.scope,
    label: credential.label,
    usernameMasked: isVisible ? credential.username : maskValue(credential.username),
    passwordMasked: isVisible ? credential.password_secret : "********",
    visibleToRoles: credential.visible_roles as UserRole[],
    isVisible,
    ...(credential.notes ? { notes: credential.notes } : {})
  };
}

function maskValue(value: string): string {
  if (value.length <= 2) {
    return "**";
  }

  return `${value.slice(0, 1)}${"*".repeat(Math.max(2, value.length - 2))}${value.slice(-1)}`;
}

function groupBy<TValue>(values: TValue[], getKey: (value: TValue) => string): Map<string, TValue[]> {
  const grouped = new Map<string, TValue[]>();

  for (const value of values) {
    const key = getKey(value);
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }

  return grouped;
}

async function loadGlobalSettings(database: DatabaseClient): Promise<GlobalMasterDataSettings> {
  const result = await database.query<GlobalSettingsRow>(
    "select monitoring_interval_seconds, failure_threshold, ui_density, escalation_profile, workflow_profile, password_min_length, kiosk_code_length from global_settings where id = 1"
  );
  const row = result.rows[0];

  if (!row) {
    throw new AppError("Global settings are missing.", {
      status: 500,
      code: "MASTER_GLOBAL_SETTINGS_MISSING"
    });
  }

  return toGlobalSettings(row);
}

function toGlobalSettings(row: GlobalSettingsRow): GlobalMasterDataSettings {
  return {
    monitoringIntervalSeconds: row.monitoring_interval_seconds,
    failureThreshold: row.failure_threshold,
    uiDensity: row.ui_density,
    escalationProfile: row.escalation_profile,
    workflowProfile: row.workflow_profile,
    passwordMinLength: row.password_min_length,
    kioskCodeLength: row.kiosk_code_length
  };
}

async function loadCustomers(database: DatabaseClient): Promise<CustomerRecord[]> {
  const result = await database.query<CustomerRow>("select id, name, external_ref, is_active from customers order by name asc");
  return result.rows.map(toCustomerRecord);
}

async function loadSites(database: DatabaseClient): Promise<SiteRow[]> {
  const result = await database.query<SiteRow>(
    `
      select
        s.id, s.customer_id, s.site_name, s.internal_reference, s.description, s.status, s.technical_status, s.technical_status_updated_at::text,
        s.street, s.house_number, s.postal_code, s.city, s.country, s.latitude::text, s.longitude::text,
        s.site_type, s.contact_person, s.contact_phone, s.notes, s.is_archived,
        ss.monitoring_interval_seconds, ss.failure_threshold, ss.highlight_critical_devices,
        ss.default_alarm_priority, ss.default_workflow_profile, ss.map_label_mode
      from sites s
      join site_settings ss on ss.site_id = s.id
      order by s.site_name asc
    `
  );

  return result.rows;
}

async function loadDevices(database: DatabaseClient): Promise<DeviceRow[]> {
  const result = await database.query<DeviceRow>(
    `
      select
        id, site_id, name, type, vendor, model, serial_number, status, is_active, network_address, live_view_url, mac_address,
        external_device_id, linked_nvr_device_id, channel_number, zone, viewing_direction, mount_location,
        analytics_name, rule_name, storage_label, wan_ip, lan_ip, vpn_type, provider, sim_identifier,
        audio_zone, supports_paging
      from devices
      order by name asc
    `
  );

  return result.rows;
}

async function loadAlarmSourceMappings(database: DatabaseClient): Promise<AlarmSourceMappingRow[]> {
  const result = await database.query<AlarmSourceMappingRow>(
    `
      select
        id, site_id, component_id, nvr_component_id, vendor, source_type, external_source_key,
        external_device_id, external_recorder_id, channel_number, serial_number, analytics_name,
        event_namespace, media_bundle_profile_key, description, sort_order, is_active
      from alarm_source_mappings
      order by site_id asc, sort_order asc, vendor asc, source_type asc, id asc
    `
  );

  return result.rows;
}

async function loadPlans(database: DatabaseClient): Promise<PlanRow[]> {
  const result = await database.query<PlanRow>(
    "select id, site_id, name, kind, asset_name from site_plans order by name asc"
  );

  return result.rows;
}

async function loadMarkers(database: DatabaseClient): Promise<MarkerRow[]> {
  const result = await database.query<MarkerRow>(
    "select id, plan_id, label, x::text, y::text, device_id, marker_type from plan_markers order by label asc"
  );

  return result.rows;
}

async function loadCredentials(database: DatabaseClient): Promise<CredentialRow[]> {
  const result = await database.query<CredentialRow>(
    `
      select
        c.id, c.scope, c.site_id, c.device_id, c.label, c.username, c.password_secret, c.notes,
        array_remove(array_agg(v.role_key), null) as visible_roles
      from technical_credentials c
      left join technical_credential_role_visibility v on v.credential_id = c.id
      group by c.id
      order by c.label asc
    `
  );

  return result.rows;
}

async function ensureCustomerExists(database: DatabaseClient, customerId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from customers where id = $1", [customerId]);
  if (!result.rows[0]) {
    throw new AppError("Customer not found.", {
      status: 404,
      code: "MASTER_CUSTOMER_NOT_FOUND"
    });
  }
}

async function ensureSiteExists(database: DatabaseClient, siteId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from sites where id = $1", [siteId]);
  if (!result.rows[0]) {
    throw new AppError("Site not found.", {
      status: 404,
      code: "MASTER_SITE_NOT_FOUND"
    });
  }
}

async function ensureDeviceExists(database: DatabaseClient, deviceId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from devices where id = $1", [deviceId]);
  if (!result.rows[0]) {
    throw new AppError("Device not found.", {
      status: 404,
      code: "MASTER_DEVICE_NOT_FOUND"
    });
  }
}

async function ensureDeviceBelongsToSite(
  database: DatabaseClient,
  deviceId: string,
  siteId: string,
  label: string
): Promise<void> {
  const result = await database.query<{ site_id: string }>("select site_id from devices where id = $1", [deviceId]);
  const row = result.rows[0];
  if (!row) {
    throw new AppError(`${label} not found.`, {
      status: 404,
      code: "MASTER_DEVICE_NOT_FOUND"
    });
  }
  if (row.site_id !== siteId) {
    throw new AppError(`${label} does not belong to the selected site.`, {
      status: 409,
      code: "MASTER_DEVICE_SITE_MISMATCH"
    });
  }
}

async function findSiteEntity(database: DatabaseClient, siteId: string): Promise<SiteEntity> {
  const result = await database.query<SiteRow>(
    `
      select
        s.id, s.customer_id, s.site_name, s.internal_reference, s.description, s.status, s.technical_status, s.technical_status_updated_at::text,
        s.street, s.house_number, s.postal_code, s.city, s.country, s.latitude::text, s.longitude::text,
        s.site_type, s.contact_person, s.contact_phone, s.notes, s.is_archived,
        ss.monitoring_interval_seconds, ss.failure_threshold, ss.highlight_critical_devices,
        ss.default_alarm_priority, ss.default_workflow_profile, ss.map_label_mode
      from sites s
      join site_settings ss on ss.site_id = s.id
      where s.id = $1
    `,
    [siteId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new AppError("Site not found.", {
      status: 404,
      code: "MASTER_SITE_NOT_FOUND"
    });
  }

  return {
    id: row.id,
    customerId: row.customer_id,
    siteName: row.site_name,
    address: {
      street: row.street,
      ...(row.house_number ? { houseNumber: row.house_number } : {}),
      postalCode: row.postal_code,
      city: row.city,
      country: row.country
    },
    ...(row.internal_reference ? { internalReference: row.internal_reference } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.latitude !== null && row.longitude !== null
      ? {
          coordinates: {
            latitude: Number(row.latitude),
            longitude: Number(row.longitude)
          }
        }
      : {}),
    status: row.status,
    ...(row.site_type ? { siteType: row.site_type } : {}),
    ...(row.contact_person ? { contactPerson: row.contact_person } : {}),
    ...(row.contact_phone ? { contactPhone: row.contact_phone } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    technicalStatus: {
      overallStatus: row.technical_status,
      updatedAt: row.technical_status_updated_at
    },
    isArchived: row.is_archived,
    settings: {
      monitoringIntervalSeconds: row.monitoring_interval_seconds,
      failureThreshold: row.failure_threshold,
      highlightCriticalDevices: row.highlight_critical_devices,
      defaultAlarmPriority: row.default_alarm_priority,
      defaultWorkflowProfile: row.default_workflow_profile,
      mapLabelMode: row.map_label_mode
    },
    credentials: await loadCredentialsForScope(database, "site", siteId)
  };
}

async function findDeviceEntity(database: DatabaseClient, deviceId: string): Promise<DeviceEntity> {
  const result = await database.query<DeviceRow>(
    `
      select
        id, site_id, name, type, vendor, model, serial_number, status, is_active, network_address, live_view_url, mac_address,
        external_device_id, linked_nvr_device_id, channel_number, zone, viewing_direction, mount_location,
        analytics_name, rule_name, storage_label, wan_ip, lan_ip, vpn_type, provider, sim_identifier,
        audio_zone, supports_paging
      from devices
      where id = $1
    `,
    [deviceId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new AppError("Device not found.", {
      status: 404,
      code: "MASTER_DEVICE_NOT_FOUND"
    });
  }

  const entity: DeviceEntity = {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    type: row.type,
    status: row.status,
    isActive: row.is_active,
    credentials: await loadCredentialsForScope(database, "device", deviceId)
  };

  if (row.vendor) {
    entity.vendor = row.vendor;
  }
  if (row.model) {
    entity.model = row.model;
  }
  if (row.serial_number) {
    entity.serialNumber = row.serial_number;
  }
  if (row.network_address) {
    entity.networkAddress = row.network_address;
  }
  if (row.live_view_url) {
    entity.liveViewUrl = row.live_view_url;
  }
  if (row.mac_address) {
    entity.macAddress = row.mac_address;
  }
  if (row.external_device_id) {
    entity.externalDeviceId = row.external_device_id;
  }
  if (row.linked_nvr_device_id) {
    entity.linkedNvrDeviceId = row.linked_nvr_device_id;
  }
  if (row.channel_number !== null) {
    entity.channelNumber = row.channel_number;
  }
  if (row.zone) {
    entity.zone = row.zone;
  }
  if (row.viewing_direction) {
    entity.viewingDirection = row.viewing_direction;
  }
  if (row.mount_location) {
    entity.mountLocation = row.mount_location;
  }
  if (row.analytics_name) {
    entity.analyticsName = row.analytics_name;
  }
  if (row.rule_name) {
    entity.ruleName = row.rule_name;
  }
  if (row.storage_label) {
    entity.storageLabel = row.storage_label;
  }
  if (row.wan_ip) {
    entity.wanIp = row.wan_ip;
  }
  if (row.lan_ip) {
    entity.lanIp = row.lan_ip;
  }
  if (row.vpn_type) {
    entity.vpnType = row.vpn_type;
  }
  if (row.provider) {
    entity.provider = row.provider;
  }
  if (row.sim_identifier) {
    entity.simIdentifier = row.sim_identifier;
  }
  if (row.audio_zone) {
    entity.audioZone = row.audio_zone;
  }
  if (row.supports_paging !== null) {
    entity.supportsPaging = row.supports_paging;
  }

  return entity;
}

async function findAlarmSourceMappingEntity(database: DatabaseClient, mappingId: string): Promise<AlarmSourceMappingRecord> {
  const result = await database.query<AlarmSourceMappingRow>(
    `
      select
        id, site_id, component_id, nvr_component_id, vendor, source_type, external_source_key,
        external_device_id, external_recorder_id, channel_number, serial_number, analytics_name,
        event_namespace, media_bundle_profile_key, description, sort_order, is_active
      from alarm_source_mappings
      where id = $1
    `,
    [mappingId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new AppError("Alarm source mapping not found.", {
      status: 404,
      code: "MASTER_ALARM_SOURCE_MAPPING_NOT_FOUND"
    });
  }

  return toAlarmSourceMappingRecord(row);
}

async function findPlanEntity(database: DatabaseClient, planId: string): Promise<PlanEntity> {
  const result = await database.query<PlanRow>("select id, site_id, name, kind, asset_name from site_plans where id = $1", [planId]);
  const row = result.rows[0];

  if (!row) {
    throw new AppError("Plan not found.", {
      status: 404,
      code: "MASTER_PLAN_NOT_FOUND"
    });
  }

  const markers = await database.query<MarkerRow>(
    "select id, plan_id, label, x::text, y::text, device_id, marker_type from plan_markers where plan_id = $1 order by label asc",
    [planId]
  );

  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    kind: row.kind,
    assetName: row.asset_name,
    markers: markers.rows.map((marker) => ({
      id: marker.id,
      label: marker.label,
      x: Number(marker.x),
      y: Number(marker.y),
      markerType: marker.marker_type,
      ...(marker.device_id ? { deviceId: marker.device_id } : {})
    }))
  };
}

async function loadCredentialsForScope(
  database: DatabaseClient,
  scope: "site" | "device",
  id: string
): Promise<TechnicalCredential[]> {
  const column = scope === "site" ? "site_id" : "device_id";
  const result = await database.query<CredentialRow>(
    `
      select
        c.id, c.scope, c.site_id, c.device_id, c.label, c.username, c.password_secret, c.notes,
        array_remove(array_agg(v.role_key), null) as visible_roles
      from technical_credentials c
      left join technical_credential_role_visibility v on v.credential_id = c.id
      where c.${column} = $1
      group by c.id
    `,
    [id]
  );

  return result.rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    label: row.label,
    username: row.username,
    password: row.password_secret,
    visibleToRoles: row.visible_roles as UserRole[],
    ...(row.notes ? { notes: row.notes } : {})
  }));
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}