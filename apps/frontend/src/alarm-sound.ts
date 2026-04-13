import type { AlarmPipelineItem, AlarmPriority } from "@leitstelle/contracts";

import { state, type AlarmSoundPermissionState } from "./state.js";

type AlarmPipelineUpdateSource = "fetch" | "poll";

type AlarmSoundControllerDeps = {
  onStateChange: () => void;
  createAudioContext?: () => AudioContext | null;
};

type AlarmPipelineUpdate = {
  previousItems: AlarmPipelineItem[];
  nextItems: AlarmPipelineItem[];
  source: AlarmPipelineUpdateSource;
};

export type AlarmSoundController = {
  handleAlarmPipelineUpdate: (update: AlarmPipelineUpdate) => Promise<void>;
  arm: () => Promise<void>;
  playPreview: () => Promise<void>;
  resetTracking: () => void;
};

const notificationFrequencies = [880, 1174];
const notificationStepDurationSeconds = 0.14;
const notificationStepGapSeconds = 0.05;

export function createAlarmSoundController(deps: AlarmSoundControllerDeps): AlarmSoundController {
  const knownAlarmIds = new Set<string>();
  let hasBaseline = false;
  let audioContext: AudioContext | null = null;
  let activeOscillators: OscillatorNode[] = [];
  let activeGains: GainNode[] = [];

  function setPermissionState(nextState: AlarmSoundPermissionState): void {
    if (state.alarmSoundPermissionState === nextState) {
      return;
    }
    state.alarmSoundPermissionState = nextState;
    deps.onStateChange();
  }

  function ensureAudioContext(): AudioContext | null {
    if (audioContext) {
      return audioContext;
    }

    const nextAudioContext = deps.createAudioContext?.() ?? createBrowserAudioContext();
    if (!nextAudioContext) {
      setPermissionState("unsupported");
      return null;
    }

    audioContext = nextAudioContext;
    return audioContext;
  }

  async function arm(): Promise<void> {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }
      setPermissionState(context.state === "running" ? "ready" : "blocked");
    } catch {
      setPermissionState("blocked");
    }
  }

  async function playNotification(): Promise<void> {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }
      if (context.state !== "running") {
        setPermissionState("blocked");
        return;
      }

      stopActiveSignal();

      const startAt = context.currentTime + 0.01;
      for (const [index, frequency] of notificationFrequencies.entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const toneStartAt = startAt + index * (notificationStepDurationSeconds + notificationStepGapSeconds);
        const toneEndAt = toneStartAt + notificationStepDurationSeconds;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, toneStartAt);

        gain.gain.setValueAtTime(0.0001, toneStartAt);
        gain.gain.exponentialRampToValueAtTime(0.16, toneStartAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneEndAt);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(toneStartAt);
        oscillator.stop(toneEndAt + 0.02);

        activeOscillators.push(oscillator);
        activeGains.push(gain);

        oscillator.addEventListener("ended", () => {
          activeOscillators = activeOscillators.filter((entry) => entry !== oscillator);
          activeGains = activeGains.filter((entry) => entry !== gain);
          oscillator.disconnect();
          gain.disconnect();
        }, { once: true });
      }

      setPermissionState("ready");
    } catch {
      stopActiveSignal();
      setPermissionState("blocked");
    }
  }

  function stopActiveSignal(): void {
    if (!audioContext) {
      activeOscillators = [];
      activeGains = [];
      return;
    }

    const stopAt = audioContext.currentTime;
    for (const oscillator of activeOscillators) {
      try {
        oscillator.stop(stopAt);
      } catch {
        oscillator.disconnect();
      }
    }
    for (const gain of activeGains) {
      try {
        gain.disconnect();
      } catch {
        // noop
      }
    }
    activeOscillators = [];
    activeGains = [];
  }

  function rememberAlarms(items: AlarmPipelineItem[]): void {
    for (const item of items) {
      knownAlarmIds.add(item.id);
    }
    hasBaseline = true;
  }

  async function handleAlarmPipelineUpdate(update: AlarmPipelineUpdate): Promise<void> {
    const hadBaselineBeforeUpdate = hasBaseline;
    const knownIdsBeforeUpdate = new Set(knownAlarmIds);
    rememberAlarms(update.nextItems);

    if (update.source !== "poll" || !hadBaselineBeforeUpdate) {
      return;
    }

    const hasNewRelevantAlarm = update.nextItems.some((item) =>
      !knownIdsBeforeUpdate.has(item.id) && isAudiblePriority(item.priority)
    );

    if (!hasNewRelevantAlarm || !state.alarmSoundEnabled) {
      return;
    }

    await playNotification();
  }

  function resetTracking(): void {
    knownAlarmIds.clear();
    hasBaseline = false;
  }

  return {
    handleAlarmPipelineUpdate,
    arm,
    async playPreview(): Promise<void> {
      await playNotification();
    },
    resetTracking
  };
}

export function isAudiblePriority(priority: AlarmPriority): boolean {
  if (priority === "critical" || priority === "high") {
    return true;
  }
  return priority === "normal" && state.alarmSoundIncludeNormalPriority;
}

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const BrowserAudioContext = window.AudioContext
    ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ?? null;

  return BrowserAudioContext ? new BrowserAudioContext() : null;
}
