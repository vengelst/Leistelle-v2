/**
 * Sehr kleiner JSON-Logger fuer alle Runtime-Prozesse.
 *
 * Das Ziel ist kein komplexes Logging-Framework, sondern ein stabiles,
 * maschinenlesbares Format, das in Docker, lokalen Tests und auf dem Server
 * ohne weitere Adapter funktioniert.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerContext = {
  service: string;
  environment: string;
};

export type Logger = {
  debug: (event: string, payload?: Record<string, unknown>) => void;
  info: (event: string, payload?: Record<string, unknown>) => void;
  warn: (event: string, payload?: Record<string, unknown>) => void;
  error: (event: string, payload?: Record<string, unknown>) => void;
};

export function createLogger(context: LoggerContext): Logger {
  const write = (level: LogLevel, event: string, payload: Record<string, unknown> = {}): void => {
    // Gemeinsame Grundstruktur fuer alle Logzeilen, damit Auswertung spaeter einfach bleibt.
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      service: context.service,
      environment: context.environment,
      payload
    };

    const line = JSON.stringify(entry);

    // Fehler und Warnungen gehen absichtlich auf stderr, alles andere auf stdout.
    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  };

  return {
    debug: (event, payload) => write("debug", event, payload),
    info: (event, payload) => write("info", event, payload),
    warn: (event, payload) => write("warn", event, payload),
    error: (event, payload) => write("error", event, payload)
  };
}

