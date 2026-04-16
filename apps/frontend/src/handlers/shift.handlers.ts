/**
 * Stellt die Shift-Planning-Handler unter einer kompakteren Fachschnittstelle bereit.
 */
import type { AppHandlers } from "../actions/events.js";

type ShiftHandlerDeps = {
  fetchShiftPlanning: (successMessage: string | null) => Promise<void>;
  pollShiftPlanning: () => Promise<boolean>;
  handleShiftPlanningFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleShiftPlanningReset: () => Promise<void>;
  handleShiftPlanningSubmit: (event: SubmitEvent) => Promise<void>;
  handleShiftPlanningEdit: (shiftId: string) => void;
  handleShiftPlanningEditorReset: () => void;
};

export function createShiftHandlers(
  deps: ShiftHandlerDeps
): Pick<
  AppHandlers,
  | "handleShiftPlanningFilterSubmit"
  | "handleShiftPlanningReset"
  | "handleShiftPlanningSubmit"
  | "handleShiftPlanningEdit"
  | "handleShiftPlanningEditorReset"
> & {
  fetchShiftPlanning: (successMessage: string | null) => Promise<void>;
  pollShiftPlanning: () => Promise<boolean>;
} {
  return {
    fetchShiftPlanning: deps.fetchShiftPlanning,
    pollShiftPlanning: deps.pollShiftPlanning,
    handleShiftPlanningFilterSubmit: deps.handleShiftPlanningFilterSubmit,
    handleShiftPlanningReset: deps.handleShiftPlanningReset,
    handleShiftPlanningSubmit: deps.handleShiftPlanningSubmit,
    handleShiftPlanningEdit: deps.handleShiftPlanningEdit,
    handleShiftPlanningEditorReset: deps.handleShiftPlanningEditorReset
  };
}
