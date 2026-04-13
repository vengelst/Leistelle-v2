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
