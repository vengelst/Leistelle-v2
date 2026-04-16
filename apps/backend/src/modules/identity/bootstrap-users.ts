/**
 * Initialisiert die Startbenutzer ueber den bestehenden Seed-Pfad der Datenbank.
 */
import type { DatabaseClient } from "../../db/client.js";
import { seedDatabase } from "../../db/seed.js";

export async function createBootstrapUsers(database: DatabaseClient, defaultPassword: string): Promise<void> {
  await seedDatabase(database, defaultPassword);
}