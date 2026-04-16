/**
 * Stellt die Backend-Anbindung fuer das Alarm-Core-Modul ueber den Datenbank-Store bereit.
 */
import type { DatabaseClient } from "../../db/client.js";
import { createAlarmCoreStore } from "./store.js";

export function createAlarmCoreModule(database: DatabaseClient) {
  return createAlarmCoreStore(database);
}