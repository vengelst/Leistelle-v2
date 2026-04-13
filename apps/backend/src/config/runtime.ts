import {
  parseBoolean,
  parseNumber,
  parseString,
  readBaseRuntimeEnvironment,
  readDatabaseRuntimeEnvironment
} from "@leitstelle/config";

export type BackendRuntimeConfig = {
  serviceName: string;
  version: string;
  environment: string;
  http: {
    host: string;
    port: number;
    trustProxy: boolean;
  };
  auth: {
    sessionTtlHours: number;
    bootstrapPassword: string;
  };
  database: {
    url: string;
  };
  cors: {
    origin: string;
  };
  mediaStorage: {
    type: "reference" | "filesystem";
    baseUrl?: string;
    localPath?: string;
  };
  alarmAssignment: {
    autoAssignLightEnabled: boolean;
  };
  externalAlarmIngestion: {
    sharedSecret?: string;
  };
  externalMediaIngestion: {
    sharedSecret?: string;
    correlationToleranceSeconds: number;
    vendorCorrelationToleranceSeconds: Partial<Record<string, number>>;
  };
};

export function loadBackendRuntimeConfig(): BackendRuntimeConfig {
  const base = readBaseRuntimeEnvironment(process.env);
  const database = readDatabaseRuntimeEnvironment(process.env);

  const config: BackendRuntimeConfig = {
    serviceName: "backend",
    version: base.appVersion,
    environment: base.nodeEnv,
    http: {
      host: process.env.HTTP_HOST ?? "127.0.0.1",
      port: parseNumber(process.env.HTTP_PORT, 8080),
      trustProxy: parseBoolean(process.env.HTTP_TRUST_PROXY, false)
    },
    auth: {
      sessionTtlHours: parseNumber(process.env.AUTH_SESSION_TTL_HOURS, 8),
      bootstrapPassword: parseString(process.env.AUTH_BOOTSTRAP_PASSWORD, "Leitstelle!2026")
    },
    database: {
      url: database.databaseUrl
    },
    cors: {
      origin: parseString(process.env.FRONTEND_ORIGIN, "http://127.0.0.1:4173")
    },
    mediaStorage: {
      type: readMediaStorageType(),
      ...(process.env.MEDIA_STORAGE_BASE_URL?.trim()
        ? { baseUrl: normalizeBaseUrl(process.env.MEDIA_STORAGE_BASE_URL.trim()) }
        : {}),
      ...(process.env.MEDIA_STORAGE_LOCAL_PATH?.trim()
        ? { localPath: process.env.MEDIA_STORAGE_LOCAL_PATH.trim() }
        : {})
    },
    alarmAssignment: {
      autoAssignLightEnabled: parseBoolean(process.env.ALARM_AUTO_ASSIGNMENT_LIGHT_ENABLED, false)
    },
    externalAlarmIngestion: {
      ...(process.env.ALARM_EXTERNAL_INGESTION_SHARED_SECRET?.trim()
        ? { sharedSecret: process.env.ALARM_EXTERNAL_INGESTION_SHARED_SECRET.trim() }
        : {})
    },
    externalMediaIngestion: {
      ...(process.env.ALARM_EXTERNAL_MEDIA_INGESTION_SHARED_SECRET?.trim()
        ? { sharedSecret: process.env.ALARM_EXTERNAL_MEDIA_INGESTION_SHARED_SECRET.trim() }
        : {}),
      correlationToleranceSeconds: parseNumber(process.env.ALARM_EXTERNAL_MEDIA_CORRELATION_TOLERANCE_SECONDS, 30),
      vendorCorrelationToleranceSeconds: compactVendorCorrelationOverrides()
    }
  };

  assertProductionRuntimeSafety(config, process.env);
  return config;
}

function readMediaStorageType(): BackendRuntimeConfig["mediaStorage"]["type"] {
  const rawValue = process.env.MEDIA_STORAGE_TYPE?.trim().toLowerCase();
  return rawValue === "filesystem" ? "filesystem" : "reference";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function compactVendorCorrelationOverrides(): Partial<Record<string, number>> {
  const entries: Array<[string, number | undefined]> = [
    ["grundig", readVendorTolerance("GRUNDIG")],
    ["dahua", readVendorTolerance("DAHUA")],
    ["hikvision", readVendorTolerance("HIKVISION")],
    ["ajax", readVendorTolerance("AJAX")]
  ];

  return Object.fromEntries(entries.filter((entry): entry is [string, number] => entry[1] !== undefined));
}

function readVendorTolerance(vendorKey: string): number | undefined {
  const rawValue = process.env[`ALARM_EXTERNAL_MEDIA_CORRELATION_TOLERANCE_${vendorKey}_SECONDS`];
  return rawValue?.trim() ? parseNumber(rawValue, 30) : undefined;
}

function assertProductionRuntimeSafety(config: BackendRuntimeConfig, env: NodeJS.ProcessEnv): void {
  if (config.environment !== "production") {
    return;
  }

  const bootstrapPassword = config.auth.bootstrapPassword.trim();
  if (!env.AUTH_BOOTSTRAP_PASSWORD?.trim() || bootstrapPassword === "Leitstelle!2026") {
    throw new Error("AUTH_BOOTSTRAP_PASSWORD must be set to a production-safe value when NODE_ENV=production.");
  }
}
