import assert from "node:assert/strict";
import test from "node:test";

import { createAlarmLiveRefreshController } from "../alarm-live-refresh.js";

test("alarm live refresh starts once and cleans up interval plus visibility listener", () => {
  const intervalCallbacks = new Map<number, () => void>();
  const clearedIntervals: number[] = [];
  let nextIntervalId = 1;
  let visibilityCallback: (() => void) | null = null;
  let detachCalls = 0;

  const controller = createAlarmLiveRefreshController({
    intervalMs: 15000,
    setInterval: (callback) => {
      const intervalId = nextIntervalId++;
      intervalCallbacks.set(intervalId, callback);
      return intervalId;
    },
    clearInterval: (intervalId) => {
      clearedIntervals.push(intervalId);
      intervalCallbacks.delete(intervalId);
    },
    onVisibilityChange: (callback) => {
      visibilityCallback = callback;
      return () => {
        detachCalls += 1;
        visibilityCallback = null;
      };
    },
    isDocumentVisible: () => true,
    shouldRefresh: () => true,
    shouldSkip: () => false,
    refreshOpenAlarms: async () => ({ changed: false, selectedChanged: false }),
    refreshSelectedDetail: async () => false,
    render: () => undefined,
    setFailure: () => undefined
  });

  const stopFirst = controller.start();
  const stopSecond = controller.start();

  assert.equal(controller.isRunning(), true);
  assert.equal(intervalCallbacks.size, 1);
  assert.notEqual(visibilityCallback, null);

  stopSecond();

  assert.equal(controller.isRunning(), false);
  assert.deepEqual(clearedIntervals, [1]);
  assert.equal(detachCalls, 1);
  assert.equal(intervalCallbacks.size, 0);
  assert.equal(visibilityCallback, null);

  stopFirst();
  assert.deepEqual(clearedIntervals, [1]);
  assert.equal(detachCalls, 1);
});

test("alarm live refresh polls only in sichtbarem relevanten Kontext und aktualisiert den Detailkontext bei Bedarf", async () => {
  const intervalCallbacks = new Map<number, () => void>();
  let nextIntervalId = 1;
  const visibilityCallbacks: Array<() => void> = [];
  let visible = false;
  let shouldRefresh = false;
  let refreshOpenCalls = 0;
  let refreshDetailCalls = 0;
  let renderCalls = 0;

  const controller = createAlarmLiveRefreshController({
    intervalMs: 15000,
    setInterval: (callback) => {
      const intervalId = nextIntervalId++;
      intervalCallbacks.set(intervalId, callback);
      return intervalId;
    },
    clearInterval: (intervalId) => {
      intervalCallbacks.delete(intervalId);
    },
    onVisibilityChange: (callback) => {
      visibilityCallbacks.push(callback);
      return () => {
        const index = visibilityCallbacks.indexOf(callback);
        if (index >= 0) {
          visibilityCallbacks.splice(index, 1);
        }
      };
    },
    isDocumentVisible: () => visible,
    shouldRefresh: () => shouldRefresh,
    shouldSkip: () => false,
    refreshOpenAlarms: async () => {
      refreshOpenCalls += 1;
      return { changed: true, selectedChanged: true };
    },
    refreshSelectedDetail: async () => {
      refreshDetailCalls += 1;
      return true;
    },
    render: () => {
      renderCalls += 1;
    },
    setFailure: () => undefined
  });

  controller.start();
  const tick = intervalCallbacks.get(1);
  if (!tick) {
    throw new Error("Expected interval callback to be registered.");
  }

  tick();
  await Promise.resolve();
  assert.equal(refreshOpenCalls, 0);
  assert.equal(refreshDetailCalls, 0);
  assert.equal(renderCalls, 0);

  visible = true;
  shouldRefresh = true;
  const notifyVisible = visibilityCallbacks[0];
  if (!notifyVisible) {
    throw new Error("Expected visibility listener to be registered.");
  }
  notifyVisible();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(refreshOpenCalls, 1);
  assert.equal(refreshDetailCalls, 1);
  assert.equal(renderCalls, 1);
});

test("alarm live refresh startet keinen zweiten Poll waehrend ein Tick noch laeuft", async () => {
  const intervalCallbacks = new Map<number, () => void>();
  let nextIntervalId = 1;
  const pendingRefresh = createDeferred<void>();
  let refreshOpenCalls = 0;

  const controller = createAlarmLiveRefreshController({
    intervalMs: 15000,
    setInterval: (callback) => {
      const intervalId = nextIntervalId++;
      intervalCallbacks.set(intervalId, callback);
      return intervalId;
    },
    clearInterval: (intervalId) => {
      intervalCallbacks.delete(intervalId);
    },
    onVisibilityChange: () => () => undefined,
    isDocumentVisible: () => true,
    shouldRefresh: () => true,
    shouldSkip: () => false,
    refreshOpenAlarms: async () => {
      refreshOpenCalls += 1;
      await pendingRefresh.promise;
      return { changed: false, selectedChanged: false };
    },
    refreshSelectedDetail: async () => false,
    render: () => undefined,
    setFailure: () => undefined
  });

  controller.start();
  const tick = intervalCallbacks.get(1);
  if (!tick) {
    throw new Error("Expected interval callback to be registered.");
  }

  tick();
  tick();
  await Promise.resolve();
  assert.equal(refreshOpenCalls, 1);

  pendingRefresh.resolve();
  await Promise.resolve();
  await Promise.resolve();

  tick();
  await Promise.resolve();
  assert.equal(refreshOpenCalls, 2);
});

test("alarm live refresh meldet Fehler kontrolliert ueber die bestehende Failure-Mechanik", async () => {
  const intervalCallbacks = new Map<number, () => void>();
  let nextIntervalId = 1;
  const failures: string[] = [];

  const controller = createAlarmLiveRefreshController({
    intervalMs: 15000,
    setInterval: (callback) => {
      const intervalId = nextIntervalId++;
      intervalCallbacks.set(intervalId, callback);
      return intervalId;
    },
    clearInterval: (intervalId) => {
      intervalCallbacks.delete(intervalId);
    },
    onVisibilityChange: () => () => undefined,
    isDocumentVisible: () => true,
    shouldRefresh: () => true,
    shouldSkip: () => false,
    refreshOpenAlarms: async () => {
      throw new Error("Netzwerk kurzzeitig nicht erreichbar");
    },
    refreshSelectedDetail: async () => false,
    render: () => undefined,
    setFailure: (message) => {
      failures.push(message);
    }
  });

  controller.start();
  const tick = intervalCallbacks.get(1);
  if (!tick) {
    throw new Error("Expected interval callback to be registered.");
  }

  tick();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(failures, ["Netzwerk kurzzeitig nicht erreichbar"]);
});

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
