/**
 * CLI-Einstiegspunkt fuer Datenbankmigrationen.
 *
 * Die eigentliche Migrationslogik lebt im DB-Modul; dieses Skript startet nur
 * Konfiguration, Verbindung und den kontrollierten Prozessablauf.
 */
import { createDatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrator.js";
import { loadBackendRuntimeConfig } from "../config/runtime.js";

const config = loadBackendRuntimeConfig();
const database = createDatabaseClient(config);

try {
  const executed = await runMigrations(database);
  console.log(JSON.stringify({ executed }));
} finally {
  await database.close();
}
