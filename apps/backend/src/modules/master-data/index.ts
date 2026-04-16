/**
 * Kompositionsmodul fuer Stammdaten.
 *
 * Die Datei verdrahtet Store und Service des Master-Data-Moduls zu einem
 * einsatzfaehigen Backend-Baustein.
 */
import type { AuditTrail } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { IdentityService } from "../identity/types.js";
import { createMasterDataService, type MasterDataService } from "./service.js";
import { createMasterDataStore } from "./store.js";

export function createMasterDataModule(identity: IdentityService, audit: AuditTrail, database: DatabaseClient): MasterDataService {
  const store = createMasterDataStore(database);
  return createMasterDataService({
    identity,
    store,
    audit
  });
}
