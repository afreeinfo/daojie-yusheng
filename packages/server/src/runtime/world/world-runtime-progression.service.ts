import { Inject, Injectable } from '@nestjs/common';

import { PlayerRuntimeService } from '../player/player-runtime.service';

interface ProgressionPlayerRuntimePort {
  attemptBreakthrough(playerId: string, currentTick: number): unknown;
  refineRootFoundation(playerId: string, currentTick: number): unknown;
  handleHeavenGateAction(playerId: string, action: string, element: string | null | undefined, currentTick: number): unknown;
}

interface ProgressionDeps {
  resolveCurrentTickForPlayerId(playerId: string): number;
}

@Injectable()
export class WorldRuntimeProgressionService {
  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: ProgressionPlayerRuntimePort,
  ) {}

  dispatchBreakthrough(playerId: string, deps: ProgressionDeps): unknown {
    return this.playerRuntimeService.attemptBreakthrough(playerId, deps.resolveCurrentTickForPlayerId(playerId));
  }

  dispatchRootFoundationRefine(playerId: string, deps: ProgressionDeps): unknown {
    return this.playerRuntimeService.refineRootFoundation(playerId, deps.resolveCurrentTickForPlayerId(playerId));
  }

  dispatchHeavenGateAction(
    playerId: string,
    action: string,
    element: string | null | undefined,
    deps: ProgressionDeps,
  ): unknown {
    return this.playerRuntimeService.handleHeavenGateAction(
      playerId,
      action,
      element,
      deps.resolveCurrentTickForPlayerId(playerId),
    );
  }
}
