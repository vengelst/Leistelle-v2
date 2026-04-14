import type { OperatorLayoutConfig, OperatorLayoutProfile, OperatorWindowRole } from "./state.js";

const operatorWindowRoleSearchParam = "leitstelleWindow";
const operatorWindowName = "leitstelle-operator-secondary";
const operatorSelectionChannelName = "leitstelle.operator.selection";

type OperatorSelectionMessage = {
  type: "alarm-selected";
  alarmCaseId: string;
};

type OperatorLayoutMessage = {
  type: "layout-updated";
  layout: OperatorLayoutConfig;
  profiles: OperatorLayoutProfile[];
  draftName: string;
  editorOpen: boolean;
};

export function resolveOperatorWindowRole(search: string): OperatorWindowRole {
  const params = new URLSearchParams(search);
  return params.get(operatorWindowRoleSearchParam) === "secondary" ? "secondary" : "primary";
}

export function applyOperatorWindowDocumentState(role: OperatorWindowRole): void {
  window.document.body.dataset.operatorWindowRole = role;
  window.document.title = role === "secondary" ? "Leitstelle | Alarmmonitor" : "Leitstelle";
}

export function openSecondaryOperatorWindow(targetHash: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(operatorWindowRoleSearchParam, "secondary");
  url.hash = targetHash;
  const popup = window.open(
    url.toString(),
    operatorWindowName,
    "popup=yes,width=1680,height=1024,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes"
  );
  popup?.focus();
}

export function createOperatorSelectionSync(
  deps: {
    onAlarmSelection: (alarmCaseId: string) => void;
    onLayoutUpdate: (layout: OperatorLayoutConfig, profiles: OperatorLayoutProfile[], draftName: string, editorOpen: boolean) => void;
  }
): {
  start: () => () => void;
  broadcastAlarmSelection: (alarmCaseId: string) => void;
  broadcastLayoutUpdate: (layout: OperatorLayoutConfig, profiles: OperatorLayoutProfile[], draftName: string, editorOpen: boolean) => void;
} {
  const channel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(operatorSelectionChannelName)
    : null;

  return {
    start(): () => void {
      if (!channel) {
        return () => undefined;
      }

      const listener = (event: MessageEvent<OperatorSelectionMessage | OperatorLayoutMessage>) => {
        if (event.data?.type === "alarm-selected" && event.data.alarmCaseId) {
          deps.onAlarmSelection(event.data.alarmCaseId);
          return;
        }

        if (event.data?.type === "layout-updated") {
          deps.onLayoutUpdate(event.data.layout, event.data.profiles, event.data.draftName, event.data.editorOpen);
        }
      };

      channel.addEventListener("message", listener);
      return () => {
        channel.removeEventListener("message", listener);
        channel.close();
      };
    },
    broadcastAlarmSelection(alarmCaseId: string): void {
      if (!channel || !alarmCaseId) {
        return;
      }

      channel.postMessage({
        type: "alarm-selected",
        alarmCaseId
      } satisfies OperatorSelectionMessage);
    },
    broadcastLayoutUpdate(layout: OperatorLayoutConfig, profiles: OperatorLayoutProfile[], draftName: string, editorOpen: boolean): void {
      if (!channel) {
        return;
      }

      channel.postMessage({
        type: "layout-updated",
        layout,
        profiles,
        draftName,
        editorOpen
      } satisfies OperatorLayoutMessage);
    }
  };
}
