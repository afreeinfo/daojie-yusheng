import { Inject, Injectable } from '@nestjs/common';
import { S2C, type S2C_PayloadMap } from '@mud/shared';
import type { Socket } from 'socket.io';

import { WorldClientEventService } from './world-client-event.service';

type TileDetailPayload = S2C_PayloadMap[typeof S2C.TileDetail];

interface WorldClientEventEmitter {
  emitLootWindowUpdate(client: Socket, playerId: string, x: number, y: number): void;
}

export interface ProjectionEmission {
  protocol: 'mainline';
  emitMainline: true;
}

@Injectable()
export class WorldProtocolProjectionService {
  constructor(
    @Inject(WorldClientEventService)
    private readonly worldClientEventService: WorldClientEventEmitter,
  ) {}

  emitTileDetail(client: Socket, payload: TileDetailPayload): void {
    client.emit(S2C.TileDetail, payload);
  }

  emitTileLootInteraction(client: Socket, playerId: string, payload: TileDetailPayload): void {
    this.emitTileDetail(client, payload);
    this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
  }

  resolveProjectionEmission(_client: Socket): ProjectionEmission {
    return {
      protocol: 'mainline',
      emitMainline: true,
    };
  }
}
