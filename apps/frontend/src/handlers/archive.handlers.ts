import type { AppHandlers } from "../actions/events.js";
import type { WorkspaceRouter } from "../navigation/router.js";

import { scrollToRegion } from "../utils.js";

type ArchiveHandlerDeps = {
  fetchReporting: (successMessage: string | null) => Promise<void>;
  fetchArchiveCases: (successMessage: string | null) => Promise<void>;
  handleReportingFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleReportingReset: () => Promise<void>;
  handleReportingExport: () => void;
  handleArchiveFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleArchiveReset: () => Promise<void>;
  handleArchiveExport: () => void;
  handleDetail: (alarmCaseId: string) => Promise<void>;
  router: WorkspaceRouter;
};

export function createArchiveHandlers(
  deps: ArchiveHandlerDeps
): Pick<AppHandlers, "handleReportingFilterSubmit" | "handleReportingReset" | "handleReportingExport" | "handleArchiveFilterSubmit" | "handleArchiveReset" | "handleArchiveExport" | "handleArchiveOpen"> & {
  fetchReporting: (successMessage: string | null) => Promise<void>;
  fetchArchiveCases: (successMessage: string | null) => Promise<void>;
} {
  return {
    fetchReporting: deps.fetchReporting,
    fetchArchiveCases: deps.fetchArchiveCases,
    handleReportingFilterSubmit: deps.handleReportingFilterSubmit,
    handleReportingReset: deps.handleReportingReset,
    handleReportingExport: deps.handleReportingExport,
    handleArchiveFilterSubmit: deps.handleArchiveFilterSubmit,
    handleArchiveReset: deps.handleArchiveReset,
    handleArchiveExport: deps.handleArchiveExport,
    async handleArchiveOpen(alarmCaseId: string): Promise<void> {
      if (!alarmCaseId) return;
      deps.router.navigateTo({ workspace: "leitstelle", leitstelleMode: "alarms" });
      await deps.handleDetail(alarmCaseId);
      scrollToRegion("pipeline");
    }
  };
}
