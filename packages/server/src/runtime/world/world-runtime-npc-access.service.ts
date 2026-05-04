import { Injectable, NotFoundException } from '@nestjs/common';

interface RuntimeLocation {
  instanceId: string;
}

interface NpcInstanceLike<TNpc = unknown> {
  getAdjacentNpc(playerId: string, npcId: string): TNpc | null | undefined;
  getNpc(npcId: string): TNpc | null | undefined;
}

interface NpcAccessDeps<TNpc = unknown> {
  getPlayerLocationOrThrow(playerId: string): RuntimeLocation;
  getPlayerLocation(playerId: string): RuntimeLocation | null;
  getInstanceRuntimeOrThrow(instanceId: string): NpcInstanceLike<TNpc>;
  getInstanceRuntime(instanceId: string): NpcInstanceLike<TNpc> | null | undefined;
}

@Injectable()
export class WorldRuntimeNpcAccessService {
  resolveAdjacentNpc<TNpc>(playerId: string, npcId: string, deps: NpcAccessDeps<TNpc>): TNpc {
    const location = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
    const npc = instance.getAdjacentNpc(playerId, npcId);
    if (!npc) {
      throw new NotFoundException('你离这位商人太远了');
    }
    return npc;
  }

  getNpcForPlayerMap<TNpc>(playerId: string, npcId: string, deps: NpcAccessDeps<TNpc>): TNpc | null {
    const location = deps.getPlayerLocation(playerId);
    if (!location) {
      return null;
    }
    return deps.getInstanceRuntime(location.instanceId)?.getNpc(npcId) ?? null;
  }
}
