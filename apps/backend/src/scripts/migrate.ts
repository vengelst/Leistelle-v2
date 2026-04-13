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
