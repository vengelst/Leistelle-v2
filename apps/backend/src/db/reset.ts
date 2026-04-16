/**
 * Technischer Reset der Entwicklungsdatenbank.
 *
 * Die Datei loescht die fachlichen Tabelleninhalte in definierter Reihenfolge,
 * ohne das Schema selbst zu entfernen. Sie ist fuer reproduzierbare lokale
 * Neuaufbauten gedacht, nicht fuer Produktionsbetriebe.
 */
import type { DatabaseClient } from "./client.js";

export async function resetDatabase(database: DatabaseClient): Promise<void> {
  assertDestructiveResetAllowed();
  await database.query(`
    truncate table
      monitoring_check_states,
      monitoring_check_targets,
      monitoring_service_cases,
      monitoring_disturbance_events,
      monitoring_disturbances,
      monitoring_disturbance_types,
      alarm_case_actions,
      alarm_workflow_profile_steps,
      alarm_workflow_profiles,
      alarm_action_statuses,
      alarm_action_types,
      alarm_case_false_positive_reasons,
      alarm_case_comments,
      alarm_false_positive_reasons,
      alarm_closure_reasons,
      alarm_assignments,
      alarm_media,
      alarm_events,
      alarm_cases,
      technical_credential_role_visibility,
      technical_credentials,
      plan_markers,
      site_plans,
      devices,
      site_settings,
      sites,
      customers,
      audit_events,
      user_sessions,
      user_status_history,
      user_roles,
      roles,
      users,
      global_settings
    restart identity
    cascade
  `);
}

function assertDestructiveResetAllowed(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (process.env.ALLOW_DESTRUCTIVE_RESET === "true") {
    return;
  }

  throw new Error(
    "Destruktiver Datenbank-Reset ist in production gesperrt. Verwende ALLOW_DESTRUCTIVE_RESET=true nur fuer einen bewusst freigegebenen Lauf."
  );
}
