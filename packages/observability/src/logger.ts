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
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      service: context.service,
      environment: context.environment,
      payload
    };

    const line = JSON.stringify(entry);

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

