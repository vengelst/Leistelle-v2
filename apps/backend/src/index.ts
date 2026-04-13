import { createServer } from "node:http";

import { createApp } from "./app.js";
import { createDatabaseClient, verifyDatabaseConnection } from "./db/client.js";
import { loadBackendRuntimeConfig } from "./config/runtime.js";

const config = loadBackendRuntimeConfig();
const database = createDatabaseClient(config);
await verifyDatabaseConnection(database);
await database.close();
const app = await createApp(config);

const server = createServer(app.handle);

server.listen(config.http.port, config.http.host, () => {
  app.logger.info("backend.server.started", {
    service: config.serviceName,
    host: config.http.host,
    port: config.http.port
  });
});

const close = async () => {
  server.close(() => undefined);
  await app.close();
};

process.on("SIGINT", () => {
  void close();
});

process.on("SIGTERM", () => {
  void close();
});
