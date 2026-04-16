/**
 * Kapselt Handler fuer Settings-Navigation sowie globale und workflowbezogene Formulare.
 */
import type { AppHandlers } from "../actions/events.js";
import { state, type SettingsSection } from "../state.js";

type SettingsHandlerDeps = {
  fetchWorkflowProfiles: (successMessage: string | null) => Promise<void>;
  handleGlobalSettingsSubmit: (event: SubmitEvent) => Promise<void>;
  handleWorkflowProfileSubmit: (event: SubmitEvent) => Promise<void>;
  render: () => void;
};

export function createSettingsHandlers(
  deps: SettingsHandlerDeps
): Pick<AppHandlers, "handleGlobalSettingsSubmit" | "handleWorkflowProfileSubmit" | "handleSettingsSectionChange"> & {
  fetchWorkflowProfiles: (successMessage: string | null) => Promise<void>;
} {
  return {
    fetchWorkflowProfiles: deps.fetchWorkflowProfiles,
    handleSettingsSectionChange(section: string): void {
      state.selectedSettingsSection = normalizeSettingsSection(section);
      deps.render();
    },
    handleGlobalSettingsSubmit: deps.handleGlobalSettingsSubmit,
    handleWorkflowProfileSubmit: deps.handleWorkflowProfileSubmit
  };
}

function normalizeSettingsSection(section: string): SettingsSection {
  switch (section) {
    case "general":
    case "users":
    case "roles":
      return section;
    case "overview":
    default:
      return "overview";
  }
}
