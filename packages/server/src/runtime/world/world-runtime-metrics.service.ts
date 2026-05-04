import { Injectable } from '@nestjs/common';

const TICK_METRIC_WINDOW_SIZE = 60;

export interface TickPhaseDurations {
  pendingCommandsMs: number;
  systemCommandsMs: number;
  instanceTicksMs: number;
  transfersMs: number;
  monsterActionsMs: number;
  playerAdvanceMs: number;
}

export type TickPhaseDurationHistory = {
  [Key in keyof TickPhaseDurations]: number[];
};

const TICK_PHASE_KEYS: ReadonlyArray<keyof TickPhaseDurations> = [
  'pendingCommandsMs',
  'systemCommandsMs',
  'instanceTicksMs',
  'transfersMs',
  'monsterActionsMs',
  'playerAdvanceMs',
];

const EMPTY_TICK_PHASE_DURATIONS: Readonly<TickPhaseDurations> = Object.freeze({
  pendingCommandsMs: 0,
  systemCommandsMs: 0,
  instanceTicksMs: 0,
  transfersMs: 0,
  monsterActionsMs: 0,
  playerAdvanceMs: 0,
});

@Injectable()
export class WorldRuntimeMetricsService {
  lastTickDurationMs = 0;
  lastSyncFlushDurationMs = 0;
  lastTickPhaseDurations: TickPhaseDurations = { ...EMPTY_TICK_PHASE_DURATIONS };
  tickDurationHistoryMs: number[] = [];
  syncFlushDurationHistoryMs: number[] = [];
  tickPhaseDurationHistoryMs: TickPhaseDurationHistory = createTickPhaseDurationHistory();

  recordIdleFrame(startedAt: number): void {
    this.lastTickPhaseDurations = { ...EMPTY_TICK_PHASE_DURATIONS };
    this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
    pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    pushTickPhaseDurationHistory(this.tickPhaseDurationHistoryMs, this.lastTickPhaseDurations);
  }

  recordFrameResult(startedAt: number, phaseDurations: TickPhaseDurations): void {
    this.lastTickPhaseDurations = {
      pendingCommandsMs: roundDurationMs(phaseDurations.pendingCommandsMs),
      systemCommandsMs: roundDurationMs(phaseDurations.systemCommandsMs),
      instanceTicksMs: roundDurationMs(phaseDurations.instanceTicksMs),
      transfersMs: roundDurationMs(phaseDurations.transfersMs),
      monsterActionsMs: roundDurationMs(phaseDurations.monsterActionsMs),
      playerAdvanceMs: roundDurationMs(phaseDurations.playerAdvanceMs),
    };
    this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
    pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    pushTickPhaseDurationHistory(this.tickPhaseDurationHistoryMs, this.lastTickPhaseDurations);
  }

  recordSyncFlushDuration(durationMs: number): void {
    this.lastSyncFlushDurationMs = roundDurationMs(durationMs);
    pushDurationMetric(this.syncFlushDurationHistoryMs, this.lastSyncFlushDurationMs);
  }
}

function roundDurationMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pushDurationMetric(history: number[], value: number): void {
  history.push(value);
  if (history.length > TICK_METRIC_WINDOW_SIZE) {
    history.splice(0, history.length - TICK_METRIC_WINDOW_SIZE);
  }
}

function createTickPhaseDurationHistory(): TickPhaseDurationHistory {
  return {
    pendingCommandsMs: [],
    systemCommandsMs: [],
    instanceTicksMs: [],
    transfersMs: [],
    monsterActionsMs: [],
    playerAdvanceMs: [],
  };
}

function pushTickPhaseDurationHistory(history: TickPhaseDurationHistory, durations: TickPhaseDurations): void {
  for (const key of TICK_PHASE_KEYS) {
    pushDurationMetric(history[key], durations[key]);
  }
}
