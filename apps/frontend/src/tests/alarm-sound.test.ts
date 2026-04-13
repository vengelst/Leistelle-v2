import assert from "node:assert/strict";
import test from "node:test";

import { createAlarmSoundController } from "../alarm-sound.js";
import { resetSessionScopedState, state } from "../state.js";

test("alarm sound uses fetch as silent baseline and only signals new high or critical alarms once", async () => {
  resetAlarmSoundFrontendState();
  const audioContext = new FakeAudioContext();
  const controller = createAlarmSoundController({
    onStateChange: () => undefined,
    createAudioContext: () => audioContext as unknown as AudioContext
  });

  const firstAlarm = createAlarm("alarm-1", "high");
  const secondAlarm = createAlarm("alarm-2", "critical");

  await controller.handleAlarmPipelineUpdate({
    previousItems: [],
    nextItems: [firstAlarm],
    source: "fetch"
  });
  assert.equal(audioContext.playCount, 0);

  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm],
    nextItems: [firstAlarm, secondAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 1);
  assert.equal(state.alarmSoundPermissionState, "ready");

  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm, secondAlarm],
    nextItems: [firstAlarm, secondAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 1);
});

test("alarm sound marks alarms from manual fetches as known without replaying them on later polls", async () => {
  resetAlarmSoundFrontendState();
  const audioContext = new FakeAudioContext();
  const controller = createAlarmSoundController({
    onStateChange: () => undefined,
    createAudioContext: () => audioContext as unknown as AudioContext
  });

  const firstAlarm = createAlarm("alarm-1", "high");
  const secondAlarm = createAlarm("alarm-2", "critical");
  const thirdAlarm = createAlarm("alarm-3", "high");

  await controller.handleAlarmPipelineUpdate({
    previousItems: [],
    nextItems: [firstAlarm],
    source: "fetch"
  });
  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm],
    nextItems: [firstAlarm, secondAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 1);

  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm, secondAlarm],
    nextItems: [firstAlarm, secondAlarm, thirdAlarm],
    source: "fetch"
  });
  assert.equal(audioContext.playCount, 1);

  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm, secondAlarm, thirdAlarm],
    nextItems: [firstAlarm, secondAlarm, thirdAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 1);
});

test("disabled alarm sound suppresses playback but still learns newly seen alarms", async () => {
  resetAlarmSoundFrontendState();
  state.alarmSoundEnabled = false;

  const audioContext = new FakeAudioContext();
  const controller = createAlarmSoundController({
    onStateChange: () => undefined,
    createAudioContext: () => audioContext as unknown as AudioContext
  });

  const firstAlarm = createAlarm("alarm-1", "high");
  const secondAlarm = createAlarm("alarm-2", "critical");

  await controller.handleAlarmPipelineUpdate({
    previousItems: [],
    nextItems: [firstAlarm],
    source: "fetch"
  });
  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm],
    nextItems: [firstAlarm, secondAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 0);

  state.alarmSoundEnabled = true;
  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm, secondAlarm],
    nextItems: [firstAlarm, secondAlarm],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 0);
});

test("normal alarms only trigger sound when the optional normal-priority setting is enabled", async () => {
  resetAlarmSoundFrontendState();
  const audioContext = new FakeAudioContext();
  const controller = createAlarmSoundController({
    onStateChange: () => undefined,
    createAudioContext: () => audioContext as unknown as AudioContext
  });

  const firstAlarm = createAlarm("alarm-1", "high");
  const normalAlarmA = createAlarm("alarm-2", "normal");
  const normalAlarmB = createAlarm("alarm-3", "normal");

  await controller.handleAlarmPipelineUpdate({
    previousItems: [],
    nextItems: [firstAlarm],
    source: "fetch"
  });
  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm],
    nextItems: [firstAlarm, normalAlarmA],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 0);

  state.alarmSoundIncludeNormalPriority = true;
  await controller.handleAlarmPipelineUpdate({
    previousItems: [firstAlarm, normalAlarmA],
    nextItems: [firstAlarm, normalAlarmA, normalAlarmB],
    source: "poll"
  });
  assert.equal(audioContext.playCount, 1);
});

function resetAlarmSoundFrontendState(): void {
  resetSessionScopedState();
  state.alarmSoundEnabled = true;
  state.alarmSoundIncludeNormalPriority = false;
  state.alarmSoundPermissionState = "unknown";
}

function createAlarm(alarmCaseId: string, priority: "low" | "normal" | "high" | "critical") {
  return {
    id: alarmCaseId,
    siteId: "site-1",
    alarmType: "motion",
    priority,
    priorityRank: priority === "critical" ? 4 : priority === "high" ? 3 : priority === "normal" ? 2 : 1,
    lifecycleStatus: "received",
    assessmentStatus: "pending",
    technicalState: "complete",
    title: alarmCaseId,
    receivedAt: `2026-04-12T08:00:0${alarmCaseId.slice(-1)}.000Z`,
    lastEventAt: `2026-04-12T08:00:0${alarmCaseId.slice(-1)}.000Z`,
    createdAt: `2026-04-12T08:00:0${alarmCaseId.slice(-1)}.000Z`,
    updatedAt: `2026-04-12T08:00:0${alarmCaseId.slice(-1)}.000Z`,
    siteName: "Standort 1",
    customerName: "Kunde 1",
    mediaCount: 0,
    eventCount: 1,
    hasTechnicalIssue: false
  } as any;
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  playCount = 0;
  private oscillatorCount = 0;

  async resume(): Promise<void> {
    this.state = "running";
  }

  createOscillator(): OscillatorNode {
    if (this.oscillatorCount % 2 === 0) {
      this.playCount += 1;
    }
    this.oscillatorCount += 1;
    return new FakeOscillatorNode() as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }
}

class FakeOscillatorNode {
  private endedListeners: Array<() => void> = [];

  frequency = {
    setValueAtTime: () => undefined
  };

  type: OscillatorType = "sine";

  connect(): void {
    // noop
  }

  disconnect(): void {
    // noop
  }

  start(): void {
    // noop
  }

  stop(): void {
    for (const listener of this.endedListeners) {
      listener();
    }
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "ended") {
      this.endedListeners.push(listener);
    }
  }
}

class FakeGainNode {
  gain = {
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined
  };

  connect(): void {
    // noop
  }

  disconnect(): void {
    // noop
  }
}
