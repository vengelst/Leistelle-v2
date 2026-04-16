/**
 * Re-exportiert die Alarm-Handler unter dem fachlichen Alarm-Domain-Namen.
 */
import { createAlarmHandlers } from "../actions/alarm-handlers.js";

export { createAlarmHandlers as createAlarmDomainHandlers };
