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
