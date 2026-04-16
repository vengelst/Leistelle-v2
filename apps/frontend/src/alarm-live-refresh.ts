/**
 * Technischer Auto-Refresh-Controller fuer die offene Alarmpipeline.
 *
 * Die Datei kuemmert sich nur um Taktung, Sichtbarkeitslogik und
 * Ueberlappungsschutz. Welche Daten neu geladen werden, wird ueber die
 * uebergebenen Callback-Funktionen gesteuert.
 */
type AlarmLiveRefreshResult = {
  changed: boolean;
  selectedChanged: boolean;
};

type AlarmLiveRefreshDeps = {
  intervalMs: number;
  setInterval: (callback: () => void, intervalMs: number) => number;
  clearInterval: (intervalId: number) => void;
  onVisibilityChange: (callback: () => void) => () => void;
  isDocumentVisible: () => boolean;
  shouldRefresh: () => boolean;
  shouldSkip: () => boolean;
  refreshOpenAlarms: () => Promise<AlarmLiveRefreshResult>;
  refreshSelectedDetail: () => Promise<boolean>;
  render: () => void;
  setFailure: (message: string) => void;
  failureMessage?: string;
};

export type AlarmLiveRefreshController = {
  start: () => () => void;
  stop: () => void;
  tick: () => Promise<void>;
  isRunning: () => boolean;
};

export function createAlarmLiveRefreshController(deps: AlarmLiveRefreshDeps): AlarmLiveRefreshController {
  let running = false;
  let inFlight = false;
  let intervalId: number | null = null;
  let detachVisibilityListener: () => void = () => undefined;

  async function tick(): Promise<void> {
    if (!running || inFlight) {
      return;
    }
    if (!deps.shouldRefresh() || !deps.isDocumentVisible() || deps.shouldSkip()) {
      return;
    }

    inFlight = true;
    try {
      const pipelineResult = await deps.refreshOpenAlarms();
      const detailChanged = pipelineResult.selectedChanged
        ? await deps.refreshSelectedDetail()
        : false;

      if (pipelineResult.changed || detailChanged) {
        deps.render();
      }
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : (deps.failureMessage ?? "Automatische Aktualisierung der Leitstellen-Pipeline fehlgeschlagen."));
    } finally {
      inFlight = false;
    }
  }

  function stop(): void {
    if (!running) {
      return;
    }

    running = false;
    if (intervalId !== null) {
      deps.clearInterval(intervalId);
      intervalId = null;
    }
    detachVisibilityListener();
    detachVisibilityListener = () => undefined;
  }

  function start(): () => void {
    if (running) {
      return stop;
    }

    running = true;
    intervalId = deps.setInterval(() => {
      void tick();
    }, deps.intervalMs);
    detachVisibilityListener = deps.onVisibilityChange(() => {
      if (deps.isDocumentVisible()) {
        void tick();
      }
    });

    return stop;
  }

  return {
    start,
    stop,
    tick,
    isRunning: () => running
  };
}
