import type {
  OperatorLayoutConfig,
  OperatorLayoutProfile,
  OperatorLayoutPresetId,
  OperatorLayoutWidgetHeight,
  OperatorLayoutWidgetId,
  OperatorLayoutWidgetWidth,
  OperatorWindowRole
} from "./state.js";

const operatorLayoutStorageKeyPrefix = "leitstelle.operator.layout.v1";

export const operatorLayoutWidgetIds: OperatorLayoutWidgetId[] = [
  "queue",
  "site",
  "instructions",
  "actions",
  "documentation",
  "media",
  "plan",
  "source"
];

export type PersistedOperatorLayoutBundle = {
  layout: OperatorLayoutConfig;
  profiles: OperatorLayoutProfile[];
};

export function createOperatorLayoutPreset(presetId: OperatorLayoutPresetId): OperatorLayoutConfig {
  if (presetId === "single-screen") {
    return {
      primary: [...operatorLayoutWidgetIds],
      secondary: [],
      widgetSizes: createDefaultOperatorWidgetSizes(),
      presetId
    };
  }

  return {
    primary: ["site", "instructions", "actions", "documentation"],
    secondary: ["queue", "media", "plan", "source"],
    widgetSizes: createDefaultOperatorWidgetSizes(),
    presetId: "two-screen"
  };
}

export function normalizeOperatorLayout(layout: OperatorLayoutConfig | null | undefined): OperatorLayoutConfig {
  const initial = layout ?? createOperatorLayoutPreset("two-screen");
  const uniquePrimary = initial.primary.filter((widgetId, index, array) =>
    operatorLayoutWidgetIds.includes(widgetId) && array.indexOf(widgetId) === index
  );
  const uniqueSecondary = initial.secondary.filter((widgetId, index, array) =>
    operatorLayoutWidgetIds.includes(widgetId) && !uniquePrimary.includes(widgetId) && array.indexOf(widgetId) === index
  );
  const missingWidgets = operatorLayoutWidgetIds.filter((widgetId) =>
    !uniquePrimary.includes(widgetId) && !uniqueSecondary.includes(widgetId)
  );

  return {
    primary: [...uniquePrimary, ...missingWidgets],
    secondary: uniqueSecondary,
    widgetSizes: normalizeOperatorWidgetSizes(initial.widgetSizes),
    presetId: inferOperatorLayoutPresetId(uniquePrimary, uniqueSecondary)
  };
}

export function moveOperatorLayoutWidget(
  layout: OperatorLayoutConfig,
  widgetId: OperatorLayoutWidgetId,
  action: "up" | "down" | "to-primary" | "to-secondary"
): OperatorLayoutConfig {
  const normalized = normalizeOperatorLayout(layout);
  const currentRole: OperatorWindowRole = normalized.primary.includes(widgetId) ? "primary" : "secondary";
  const currentList = [...normalized[currentRole]];
  const currentIndex = currentList.indexOf(widgetId);
  const targetRole: OperatorWindowRole = action === "to-primary"
    ? "primary"
    : action === "to-secondary"
      ? "secondary"
      : currentRole;

  const nextPrimary = normalized.primary.filter((id) => id !== widgetId);
  const nextSecondary = normalized.secondary.filter((id) => id !== widgetId);
  const targetList = targetRole === "primary" ? nextPrimary : nextSecondary;

  if (action === "up" || action === "down") {
    const activeList = targetRole === "primary" ? nextPrimary : nextSecondary;
    if (currentIndex === -1) {
      activeList.push(widgetId);
    } else {
      const nextIndex = action === "up"
        ? Math.max(0, currentIndex - 1)
        : Math.min(activeList.length - 1, currentIndex + 1);
      activeList.splice(nextIndex, 0, widgetId);
    }
  } else {
    targetList.push(widgetId);
  }

  return normalizeOperatorLayout({
    primary: nextPrimary,
    secondary: nextSecondary,
    widgetSizes: normalized.widgetSizes,
    presetId: "custom"
  });
}

export function repositionOperatorLayoutWidget(
  layout: OperatorLayoutConfig,
  widgetId: OperatorLayoutWidgetId,
  targetRole: OperatorWindowRole,
  targetIndex: number
): OperatorLayoutConfig {
  const normalized = normalizeOperatorLayout(layout);
  const nextPrimary = normalized.primary.filter((id) => id !== widgetId);
  const nextSecondary = normalized.secondary.filter((id) => id !== widgetId);
  const targetList = targetRole === "primary" ? nextPrimary : nextSecondary;
  const boundedIndex = Math.max(0, Math.min(targetList.length, targetIndex));
  targetList.splice(boundedIndex, 0, widgetId);
  return normalizeOperatorLayout({
    primary: nextPrimary,
    secondary: nextSecondary,
    widgetSizes: normalized.widgetSizes,
    presetId: "custom"
  });
}

export function updateOperatorLayoutWidgetWidth(
  layout: OperatorLayoutConfig,
  widgetId: OperatorLayoutWidgetId,
  width: OperatorLayoutWidgetWidth
): OperatorLayoutConfig {
  const normalized = normalizeOperatorLayout(layout);
  return normalizeOperatorLayout({
    ...normalized,
    widgetSizes: {
      ...normalized.widgetSizes,
      [widgetId]: {
        ...normalized.widgetSizes[widgetId],
        width
      }
    },
    presetId: "custom"
  });
}

export function updateOperatorLayoutWidgetHeight(
  layout: OperatorLayoutConfig,
  widgetId: OperatorLayoutWidgetId,
  height: OperatorLayoutWidgetHeight
): OperatorLayoutConfig {
  const normalized = normalizeOperatorLayout(layout);
  return normalizeOperatorLayout({
    ...normalized,
    widgetSizes: {
      ...normalized.widgetSizes,
      [widgetId]: {
        ...normalized.widgetSizes[widgetId],
        height
      }
    },
    presetId: "custom"
  });
}

export function loadPersistedOperatorLayoutBundle(userId: string): PersistedOperatorLayoutBundle | null {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  const serialized = window.localStorage.getItem(buildOperatorLayoutStorageKey(userId));
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as PersistedOperatorLayoutBundle | OperatorLayoutConfig;
    if ("layout" in parsed) {
      return {
        layout: normalizeOperatorLayout(parsed.layout),
        profiles: normalizeOperatorLayoutProfiles(parsed.profiles ?? [])
      };
    }

    return {
      layout: normalizeOperatorLayout(parsed),
      profiles: []
    };
  } catch {
    return null;
  }
}

export function savePersistedOperatorLayoutBundle(
  userId: string,
  bundle: PersistedOperatorLayoutBundle
): void {
  if (!userId || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildOperatorLayoutStorageKey(userId),
    JSON.stringify({
      layout: normalizeOperatorLayout(bundle.layout),
      profiles: normalizeOperatorLayoutProfiles(bundle.profiles)
    } satisfies PersistedOperatorLayoutBundle)
  );
}

export function operatorLayoutTargetRoleLabel(role: OperatorWindowRole): string {
  return role === "primary" ? "Screen 1" : "Screen 2";
}

export function normalizeOperatorLayoutProfiles(profiles: OperatorLayoutProfile[]): OperatorLayoutProfile[] {
  return profiles
    .filter((profile, index, array) =>
      Boolean(profile?.id)
      && Boolean(profile?.name?.trim())
      && array.findIndex((candidate) => candidate.id === profile.id) === index
    )
    .map((profile) => ({
      id: profile.id,
      name: profile.name.trim(),
      layout: normalizeOperatorLayout(profile.layout)
    }));
}

export function createOperatorLayoutProfile(name: string, layout: OperatorLayoutConfig): OperatorLayoutProfile {
  return {
    id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    layout: normalizeOperatorLayout(layout)
  };
}

export function defaultOperatorLayoutDraftName(): string {
  return "Neues Layout";
}

function buildOperatorLayoutStorageKey(userId: string): string {
  return `${operatorLayoutStorageKeyPrefix}:${userId}`;
}

function inferOperatorLayoutPresetId(
  primary: OperatorLayoutWidgetId[],
  secondary: OperatorLayoutWidgetId[]
): OperatorLayoutConfig["presetId"] {
  const twoScreen = createOperatorLayoutPreset("two-screen");
  const singleScreen = createOperatorLayoutPreset("single-screen");
  if (arraysEqual(primary, twoScreen.primary) && arraysEqual(secondary, twoScreen.secondary)) {
    return "two-screen";
  }
  if (arraysEqual(primary, singleScreen.primary) && arraysEqual(secondary, singleScreen.secondary)) {
    return "single-screen";
  }
  return "custom";
}

function arraysEqual(left: OperatorLayoutWidgetId[], right: OperatorLayoutWidgetId[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function createDefaultOperatorWidgetSizes(): OperatorLayoutConfig["widgetSizes"] {
  return {
    queue: { width: "full", height: "tall" },
    site: { width: "wide", height: "normal" },
    instructions: { width: "normal", height: "normal" },
    actions: { width: "wide", height: "normal" },
    documentation: { width: "wide", height: "tall" },
    media: { width: "wide", height: "tall" },
    plan: { width: "wide", height: "tall" },
    source: { width: "normal", height: "normal" }
  };
}

function normalizeOperatorWidgetSizes(
  widgetSizes: Partial<OperatorLayoutConfig["widgetSizes"]> | undefined
): OperatorLayoutConfig["widgetSizes"] {
  const defaults = createDefaultOperatorWidgetSizes();
  return Object.fromEntries(
    operatorLayoutWidgetIds.map((widgetId) => {
      const current = widgetSizes?.[widgetId];
      return [widgetId, {
        width: current?.width === "normal" || current?.width === "wide" || current?.width === "full" ? current.width : defaults[widgetId].width,
        height: current?.height === "normal" || current?.height === "tall" ? current.height : defaults[widgetId].height
      }];
    })
  ) as OperatorLayoutConfig["widgetSizes"];
}
