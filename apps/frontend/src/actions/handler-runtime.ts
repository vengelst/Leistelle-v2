import type { LeitstelleMode, WorkspaceId } from "../state.js";

export type HandlerRuntime = {
  render: () => void;
  setBusyState: (key: string, label: string | null) => void;
  setSuccess: (message: string | null) => void;
  setFailure: (message: string) => void;
  runRenderBatch: <T>(work: () => Promise<T>) => Promise<T>;
};

export type SyncWorkspaceHash = (workspaceId: WorkspaceId, leitstelleMode?: LeitstelleMode) => void;
