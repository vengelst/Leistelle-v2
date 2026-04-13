export type BaseRuntimeEnvironment = {
  nodeEnv: string;
  appVersion: string;
};

export type DatabaseRuntimeEnvironment = {
  databaseUrl: string;
};

export function readBaseRuntimeEnvironment(env: NodeJS.ProcessEnv): BaseRuntimeEnvironment {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    appVersion: env.APP_VERSION ?? "0.1.0"
  };
}

export function parseNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  if (!rawValue) {
    return fallback;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  return fallback;
}

export function parseString(rawValue: string | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function requireString(rawValue: string | undefined, name: string): string {
  const normalized = rawValue?.trim();

  if (!normalized) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return normalized;
}

export function readDatabaseRuntimeEnvironment(env: NodeJS.ProcessEnv): DatabaseRuntimeEnvironment {
  return {
    databaseUrl: requireString(env.DATABASE_URL, "DATABASE_URL")
  };
}
