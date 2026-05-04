import { Inject, Injectable } from '@nestjs/common';

import { WorldRuntimeInstanceTickOrchestrationService } from './world-runtime-instance-tick-orchestration.service';
import { WorldRuntimeMetricsService } from './world-runtime-metrics.service';

type FrameDeps = unknown;
type InstanceTickSpeedResolver = ((templateId: string) => number | null | undefined) | null;

interface FrameOrchestrationServiceLike {
  advanceFrame(
    deps: FrameDeps,
    frameDurationMs?: number,
    getInstanceTickSpeed?: InstanceTickSpeedResolver,
  ): Promise<number>;
}

interface RuntimeMetricsServiceLike {
  recordSyncFlushDuration(durationMs: number): void;
}

@Injectable()
export class WorldRuntimeFrameService {
  constructor(
    @Inject(WorldRuntimeInstanceTickOrchestrationService)
    private readonly worldRuntimeInstanceTickOrchestrationService: FrameOrchestrationServiceLike,
    @Inject(WorldRuntimeMetricsService)
    private readonly worldRuntimeMetricsService: RuntimeMetricsServiceLike,
  ) {}

  async tickAll(deps: FrameDeps): Promise<number> {
    return this.advanceFrame(deps, 1000);
  }

  async advanceFrame(
    deps: FrameDeps,
    frameDurationMs = 1000,
    getInstanceTickSpeed: InstanceTickSpeedResolver = null,
  ): Promise<number> {
    return this.worldRuntimeInstanceTickOrchestrationService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
  }

  recordSyncFlushDuration(durationMs: number): void {
    this.worldRuntimeMetricsService.recordSyncFlushDuration(durationMs);
  }
}
