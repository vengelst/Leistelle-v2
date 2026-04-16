/**
 * Kernlogik fuer periodische technische Checks.
 *
 * Die Datei berechnet den aktiven Check-Plan, fuehrt Probearten aus, aktualisiert
 * Check-Zustaende und oeffnet, aktualisiert oder schliesst daraus technische
 * Stoerungen.
 */
import net from "node:net";

import type {
  MonitoringCheckKind,
  MonitoringCheckTargetRecord,
  MonitoringDisturbanceRecord,
  SiteTechnicalOverallStatus
} from "@leitstelle/contracts";

import type { MonitoringCheckPlanItem, MonitoringStore } from "./types.js";

export type MonitoringProbeExecutionResult = {
  ok: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type MonitoringProbeExecutor = (target: MonitoringCheckTargetRecord) => Promise<MonitoringProbeExecutionResult>;

export type MonitoringProbeRegistry = Record<MonitoringCheckKind, MonitoringProbeExecutor>;

export type MonitoringScanResult = {
  checkedCount: number;
  skippedCount: number;
  openedCount: number;
  updatedCount: number;
  resolvedCount: number;
  siteStatusChanges: number;
  targets: Array<{
    targetId: string;
    siteId: string;
    outcome: "ok" | "failed" | "skipped";
    consecutiveFailures: number;
    disturbanceId?: string;
    message?: string;
  }>;
};

type MonitoringScanOptions = {
  now?: Date;
  ignoreSchedule?: boolean;
};

type CreateMonitoringScanServiceInput = {
  store: MonitoringStore;
  probes?: Partial<MonitoringProbeRegistry>;
};

export type MonitoringScanService = {
  runOnce: (options?: MonitoringScanOptions) => Promise<MonitoringScanResult>;
};

export function createMonitoringScanService(input: CreateMonitoringScanServiceInput): MonitoringScanService {
  const probes = createMonitoringProbeRegistry(input.probes);

  return {
    async runOnce(options = {}) {
      const now = options.now ?? new Date();
      const nowIso = now.toISOString();
      const plan = await input.store.listActiveCheckPlan();
      const result: MonitoringScanResult = {
        checkedCount: 0,
        skippedCount: 0,
        openedCount: 0,
        updatedCount: 0,
        resolvedCount: 0,
        siteStatusChanges: 0,
        targets: []
      };

      const siteGroups = groupBy(plan, (item) => item.site.id);

      for (const siteTargets of siteGroups.values()) {
        const vpnAvailability = new Map<string, boolean>();
        const orderedTargets = [...siteTargets].sort((left, right) => {
          if (left.target.checkKind === "vpn" && right.target.checkKind !== "vpn") {
            return -1;
          }
          if (left.target.checkKind !== "vpn" && right.target.checkKind === "vpn") {
            return 1;
          }
          return left.target.sortOrder - right.target.sortOrder;
        });

        for (const item of orderedTargets) {
          if (!options.ignoreSchedule && !isDue(item, now)) {
            continue;
          }

          if (item.target.requiresVpn && !isVpnAvailableForSite(siteTargets, vpnAvailability)) {
            await input.store.upsertCheckState({
              targetId: item.target.id,
              lastStatus: "skipped",
              consecutiveFailures: item.state?.consecutiveFailures ?? 0,
              lastCheckedAt: nowIso,
              lastError: "vpn_prerequisite_unavailable",
              ...pickOptional("lastSuccessAt", item.state?.lastSuccessAt),
              ...pickOptional("lastFailureAt", item.state?.lastFailureAt),
              ...pickOptional("activeDisturbanceId", item.state?.activeDisturbanceId)
            });
            result.skippedCount += 1;
            result.targets.push({
              targetId: item.target.id,
              siteId: item.site.id,
              outcome: "skipped",
              consecutiveFailures: item.state?.consecutiveFailures ?? 0,
              ...(item.state?.activeDisturbanceId ? { disturbanceId: item.state.activeDisturbanceId } : {}),
              message: "vpn_prerequisite_unavailable"
            });
            continue;
          }

          const probeResult = await probes[item.target.checkKind](item.target);
          result.checkedCount += 1;

          if (item.target.checkKind === "vpn") {
            vpnAvailability.set(item.target.id, probeResult.ok);
          }

          if (probeResult.ok) {
            const resolvedDisturbance = await resolveIfNeeded(input.store, item, nowIso, probeResult.message);
            await input.store.upsertCheckState({
              targetId: item.target.id,
              lastStatus: "ok",
              consecutiveFailures: 0,
              lastCheckedAt: nowIso,
              lastSuccessAt: nowIso,
              ...pickOptional("lastFailureAt", item.state?.lastFailureAt)
            });
            if (resolvedDisturbance) {
              result.resolvedCount += 1;
            }
            result.targets.push({
              targetId: item.target.id,
              siteId: item.site.id,
              outcome: "ok",
              consecutiveFailures: 0,
              ...pickOptional("message", probeResult.message)
            });
            continue;
          }

          const consecutiveFailures = (item.state?.consecutiveFailures ?? 0) + 1;
          let activeDisturbance: MonitoringDisturbanceRecord | undefined;

          if (consecutiveFailures >= item.site.failureThreshold) {
            activeDisturbance = await openOrUpdateDisturbance(input.store, item, nowIso, probeResult.message);
            if (item.state?.activeDisturbanceId) {
              result.updatedCount += 1;
            } else {
              result.openedCount += 1;
            }
          }

          await input.store.upsertCheckState({
            targetId: item.target.id,
            lastStatus: "failed",
            consecutiveFailures,
            lastCheckedAt: nowIso,
            lastFailureAt: nowIso,
            ...pickOptional("lastSuccessAt", item.state?.lastSuccessAt),
            ...pickOptional("lastError", probeResult.message),
            ...pickOptional("activeDisturbanceId", activeDisturbance?.id ?? item.state?.activeDisturbanceId)
          });
          result.targets.push({
            targetId: item.target.id,
            siteId: item.site.id,
            outcome: "failed",
            consecutiveFailures,
            ...(activeDisturbance ? { disturbanceId: activeDisturbance.id } : {}),
            ...pickOptional("message", probeResult.message)
          });
        }

        const previousStatus = await input.store.getSiteTechnicalStatus(siteTargets[0]!.site.id);
        const currentStatus = deriveSiteOverallStatus(await input.store.listOpenDisturbancesForSite(siteTargets[0]!.site.id));
        if (currentStatus !== previousStatus.overallStatus) {
          await input.store.updateSiteTechnicalStatus({
            siteId: siteTargets[0]!.site.id,
            overallStatus: currentStatus,
            updatedAt: nowIso
          });
          result.siteStatusChanges += 1;
        }
      }

      return result;
    }
  };
}

async function openOrUpdateDisturbance(
  store: MonitoringStore,
  item: MonitoringCheckPlanItem,
  nowIso: string,
  message?: string
): Promise<MonitoringDisturbanceRecord> {
  const title = buildDisturbanceTitle(item);
  const description = buildDisturbanceDescription(item, message);

  if (item.state?.activeDisturbanceId) {
    const disturbance = await store.updateDisturbanceObservation(item.state.activeDisturbanceId, {
      title,
      description,
      ...pickOptional("comment", message)
    });
    await store.appendDisturbanceEvent({
      disturbanceId: disturbance.id,
      eventKind: "observation_updated",
      status: disturbance.status,
      message: "Monitoring disturbance observation updated.",
      ...(message ? { note: message } : {}),
      metadata: {
        targetId: item.target.id,
        checkKind: item.target.checkKind
      }
    });
    return disturbance;
  }

  const disturbance = await store.createDisturbance({
    checkTargetId: item.target.id,
    siteId: item.site.id,
    referenceLabel: item.target.label,
    disturbanceTypeId: item.target.disturbanceTypeId,
    title,
    description,
    startedAt: nowIso,
    ...pickOptional("deviceId", item.target.deviceId),
    ...pickOptional("comment", message)
  });
  await store.appendDisturbanceEvent({
    disturbanceId: disturbance.id,
    eventKind: "disturbance_opened",
    status: disturbance.status,
    message: "Monitoring disturbance opened.",
    ...(message ? { note: message } : {}),
    metadata: {
      targetId: item.target.id,
      checkKind: item.target.checkKind
    }
  });
  return disturbance;
}

async function resolveIfNeeded(
  store: MonitoringStore,
  item: MonitoringCheckPlanItem,
  nowIso: string,
  message?: string
): Promise<MonitoringDisturbanceRecord | undefined> {
  if (!item.state?.activeDisturbanceId) {
    return undefined;
  }

  const previousStatus: MonitoringDisturbanceRecord["status"] | undefined =
    item.state.lastStatus === "failed" ? "open" : undefined;

  const disturbance = await store.resolveDisturbance(item.state.activeDisturbanceId, {
    endedAt: nowIso,
    comment: message ?? "probe_recovered"
  });
  await store.appendDisturbanceEvent({
    disturbanceId: disturbance.id,
    eventKind: "status_changed",
    status: disturbance.status,
    message: "Monitoring disturbance resolved after recovery.",
    ...pickOptional("previousStatus", previousStatus),
    ...(message ? { note: message } : {}),
    metadata: {
      targetId: item.target.id,
      checkKind: item.target.checkKind
    }
  });
  await store.clearCheckStateDisturbance(item.target.id);
  return disturbance;
}

function isDue(item: MonitoringCheckPlanItem, now: Date): boolean {
  if (!item.state?.lastCheckedAt) {
    return true;
  }

  const lastCheckedAt = new Date(item.state.lastCheckedAt).getTime();
  const intervalMs = item.site.monitoringIntervalSeconds * 1000;
  return now.getTime() - lastCheckedAt >= intervalMs;
}

function isVpnAvailableForSite(siteTargets: MonitoringCheckPlanItem[], vpnAvailability: Map<string, boolean>): boolean {
  const vpnTargets = siteTargets.filter((item) => item.target.checkKind === "vpn");
  if (vpnTargets.length === 0) {
    return true;
  }

  return vpnTargets.every((item) => {
    if (vpnAvailability.has(item.target.id)) {
      return vpnAvailability.get(item.target.id) === true;
    }

    return !item.state?.activeDisturbanceId;
  });
}

function deriveSiteOverallStatus(disturbances: MonitoringDisturbanceRecord[]): SiteTechnicalOverallStatus {
  if (disturbances.length === 0) {
    return "ok";
  }

  if (
    disturbances.some(
      (entry) => entry.disturbanceTypeCode === "site_connection_disturbed" || entry.priority === "critical"
    )
  ) {
    return "offline";
  }

  return "disturbed";
}

function buildDisturbanceTitle(item: MonitoringCheckPlanItem): string {
  const scopeLabel = item.device?.name ?? item.site.siteName;
  return `${scopeLabel}: ${item.target.label}`;
}

function buildDisturbanceDescription(item: MonitoringCheckPlanItem, message?: string): string {
  return [
    `checkKind=${item.target.checkKind}`,
    `endpoint=${item.target.endpoint}`,
    ...(item.target.port !== undefined ? [`port=${item.target.port}`] : []),
    ...(message ? [`reason=${message}`] : [])
  ].join(" | ");
}

export function createMonitoringProbeRegistry(
  overrides: Partial<MonitoringProbeRegistry> = {}
): MonitoringProbeRegistry {
  return {
    vpn: overrides.vpn ?? ((target) => runTcpProbe(target, 443)),
    ping: overrides.ping ?? ((target) => runTcpProbe(target, 80)),
    http: overrides.http ?? runHttpProbe,
    api: overrides.api ?? runHttpProbe,
    onvif: overrides.onvif ?? runHttpProbe
  };
}

async function runTcpProbe(target: MonitoringCheckTargetRecord, defaultPort: number): Promise<MonitoringProbeExecutionResult> {
  const port = target.port ?? defaultPort;
  const timeoutMs = target.timeoutMs;

  return await new Promise<MonitoringProbeExecutionResult>((resolve) => {
    const socket = net.createConnection({
      host: target.endpoint,
      port
    });

    const finalize = (result: MonitoringProbeExecutionResult) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize({ ok: true, message: `tcp_connect_ok:${port}` }));
    socket.once("timeout", () => finalize({ ok: false, message: `tcp_timeout:${port}` }));
    socket.once("error", (error) => finalize({ ok: false, message: error.message }));
  });
}

async function runHttpProbe(target: MonitoringCheckTargetRecord): Promise<MonitoringProbeExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs);

  try {
    const response = await fetch(buildProbeUrl(target), {
      method: target.requestMethod ?? "GET",
      signal: controller.signal
    });
    const expected = target.expectedStatusCodes.length > 0 ? target.expectedStatusCodes : [200];
    return {
      ok: expected.includes(response.status),
      message: `http_status:${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "http_probe_failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProbeUrl(target: MonitoringCheckTargetRecord): string {
  if (target.endpoint.startsWith("http://") || target.endpoint.startsWith("https://")) {
    return target.path ? new URL(target.path, ensureTrailingSlash(target.endpoint)).toString() : target.endpoint;
  }

  const base = `http://${target.endpoint}${target.port !== undefined ? `:${target.port}` : ""}`;
  return target.path ? new URL(target.path, ensureTrailingSlash(base)).toString() : base;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
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

function pickOptional<TKey extends string, TValue>(key: TKey, value: TValue | undefined): { [K in TKey]?: TValue } {
  return value === undefined ? {} : { [key]: value } as { [K in TKey]?: TValue };
}
