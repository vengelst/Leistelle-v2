/**
 * Zentrale Laufzeit-Helfer fuer alle Workspaces.
 *
 * Dieses Paket soll absichtlich klein bleiben: keine Fachlogik, sondern nur
 * gemeinsame Regeln fuer Defaults, Pflichtwerte und einfache Typkonvertierung
 * von Environment-Variablen.
 */
export type BaseRuntimeEnvironment = {
  nodeEnv: string;
  appVersion: string;
};

export type DatabaseRuntimeEnvironment = {
  databaseUrl: string;
};

// Basiskonfiguration, die Backend, Frontend-Builds und Worker gleich lesen.
export function readBaseRuntimeEnvironment(env: NodeJS.ProcessEnv): BaseRuntimeEnvironment {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    appVersion: env.APP_VERSION ?? "0.1.0"
  };
}

// Fehlerhafte Zahlwerte fallen kontrolliert auf einen bekannten Standard zurueck.
export function parseNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Wir akzeptieren bewusst nur die klaren Env-Werte "true" und "false".
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

// Vereinheitlicht den haeufigen Fall "gesetzt, aber leer".
export function parseString(rawValue: string | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : fallback;
}

// Fuer produktionskritische Werte ist ein expliziter Fehler hilfreicher als ein stiller Fallback.
export function requireString(rawValue: string | undefined, name: string): string {
  const normalized = rawValue?.trim();

  if (!normalized) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return normalized;
}

// DB-Zugriff bleibt repo-weit an dieselbe Pflichtvariable gebunden.
export function readDatabaseRuntimeEnvironment(env: NodeJS.ProcessEnv): DatabaseRuntimeEnvironment {
  return {
    databaseUrl: requireString(env.DATABASE_URL, "DATABASE_URL")
  };
}
