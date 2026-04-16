/**
 * CLI-Einstiegspunkt fuer das manuelle oder skriptgesteuerte Seeding.
 *
 * Die eigentliche Seed-Logik liegt in `db/seed.ts`; dieses Skript kuemmert sich
 * nur um Runtime-Konfiguration, DB-Verbindung und einen sauberen Prozessablauf.
 */
import { createDatabaseClient } from "../db/client.js";
import { seedDatabase } from "../db/seed.js";
import { loadBackendRuntimeConfig } from "../config/runtime.js";

const config = loadBackendRuntimeConfig();
const database = createDatabaseClient(config);

try {
  await seedDatabase(database, config.auth.bootstrapPassword);
  console.log(JSON.stringify({ seeded: true }));
} finally {
  await database.close();
}
