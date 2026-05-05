import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

type BuildingSenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketBuildingSender(deps: BuildingSenderDeps) {
  return {
    sendBuildPlaceIntent(payload: ClientToServerEventPayload<typeof C2S.BuildPlaceIntent>): void {
      deps.emitEvent(C2S.BuildPlaceIntent, payload);
    },

    sendBuildDeconstruct(payload: ClientToServerEventPayload<typeof C2S.BuildDeconstruct>): void {
      deps.emitEvent(C2S.BuildDeconstruct, payload);
    },

    sendRoomSetRole(payload: ClientToServerEventPayload<typeof C2S.RoomSetRole>): void {
      deps.emitEvent(C2S.RoomSetRole, payload);
    },

    sendFengShuiObserve(payload: ClientToServerEventPayload<typeof C2S.FengShuiObserve>): void {
      deps.emitEvent(C2S.FengShuiObserve, payload);
    },
  };
}

export type SocketBuildingSender = ReturnType<typeof createSocketBuildingSender>;
