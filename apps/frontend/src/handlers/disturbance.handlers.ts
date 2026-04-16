/**
 * Re-exportiert die Monitoring-Handler unter dem fachlichen Stoerungs-Namen.
 */
import { createMonitoringHandlers } from "../actions/monitoring-handlers.js";

export { createMonitoringHandlers as createDisturbanceHandlers };
