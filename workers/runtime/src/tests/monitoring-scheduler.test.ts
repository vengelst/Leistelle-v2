/**
 * Tests fuer den technischen Monitoring-Scheduler der Worker-Runtime.
 *
 * Die Datei deckt Startlauf, Intervallausfuehrung, Overlap-Schutz und
 * Fehlerverhalten ab, damit die Laufsteuerung ohne Backend-Fachlogik
 * nachvollziehbar abgesichert bleibt.
 */
import assert from "node:assert/strict";
import { setImmediate as defer } from "node:timers/promises";
import test from "node:test";

import { createMonitoringScheduler } from "../monitoring-scheduler.js";

test("scheduler starts with startup run and then executes periodic runs", async () => {
  const triggers: string[] = [];
  const sleepCalls: number[] = [];
  let stopRequested = false;

  const scheduler = createMonitoringScheduler(
    {
      intervalSeconds: 30,
      runOnStartup: true
    },
    {
      logger: createTestLogger(),
      async executeRun(trigger) {
        triggers.push(trigger);
        if (trigger === "interval") {
          stopRequested = true;
        }
        return emptyResult();
      },
      async sleep(timeoutMs) {
        sleepCalls.push(timeoutMs);
      }
    }
  );

  await scheduler.start(() => stopRequested);

  assert.deepEqual(triggers, ["startup", "interval"]);
  assert.deepEqual(sleepCalls, [30000]);
});

test("scheduler prevents overlapping runs of the same job", async () => {
  const events: string[] = [];
  let releaseRun: (() => void) | undefined;

  const scheduler = createMonitoringScheduler(
    {
      intervalSeconds: 30,
      runOnStartup: false
    },
    {
      logger: createTestLogger(events),
      async executeRun() {
        await new Promise<void>((resolve) => {
          releaseRun = resolve;
        });
        return emptyResult();
      }
    }
  );

  const firstRun = scheduler.runCycle("interval");
  await defer();
  const secondRun = await scheduler.runCycle("interval");

  assert.equal(scheduler.isRunInProgress(), true);
  assert.equal(secondRun, false);
  assert.ok(events.includes("worker.job.skipped_overlap"));

  releaseRun?.();
  assert.equal(await firstRun, true);
  assert.equal(scheduler.isRunInProgress(), false);
});

test("scheduler logs failures and continues with later cycles", async () => {
  const events: string[] = [];
  const triggers: string[] = [];
  let invocation = 0;
  let stopRequested = false;

  const scheduler = createMonitoringScheduler(
    {
      intervalSeconds: 10,
      runOnStartup: false
    },
    {
      logger: createTestLogger(events),
      async executeRun(trigger) {
        triggers.push(trigger);
        invocation += 1;
        if (invocation === 1) {
          throw new Error("boom");
        }
        stopRequested = true;
        return emptyResult();
      },
      async sleep() {
        return;
      }
    }
  );

  const firstRun = await scheduler.runCycle("interval");
  assert.equal(firstRun, false);
  assert.ok(events.includes("worker.job.failed"));

  await scheduler.start(() => stopRequested);

  assert.deepEqual(triggers, ["interval", "interval"]);
  assert.ok(events.includes("worker.job.completed"));
});

function createTestLogger(events: string[] = []) {
  return {
    info(event: string): void {
      events.push(event);
    },
    error(event: string): void {
      events.push(event);
    }
  };
}

function emptyResult() {
  return {
    checkedCount: 0,
    skippedCount: 0,
    openedCount: 0,
    updatedCount: 0,
    resolvedCount: 0,
    siteStatusChanges: 0
  };
}
