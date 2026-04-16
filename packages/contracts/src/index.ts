/**
 * Zentraler Exportpunkt fuer alle verteilten API- und Domaintypen.
 *
 * Backend, Frontend und Worker importieren ihre Vertraege von hier, damit es
 * genau eine fachliche Quelle fuer Requests, Responses und Records gibt.
 */
export * from "./identity.js";
export * from "./alarm-core.js";
export * from "./master-data.js";
export * from "./monitoring.js";
export * from "./reporting.js";
export * from "./shift-planning.js";
export * from "./system.js";
