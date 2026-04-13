import type { DatabaseClient } from "../../db/client.js";
import { createAlarmCoreStore } from "./store.js";

export function createAlarmCoreModule(database: DatabaseClient) {
  return createAlarmCoreStore(database);
}
