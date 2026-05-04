import { Injectable } from '@nestjs/common';

export interface RuntimePlayerLocation {
  instanceId: string;
  sessionId?: string;
}

@Injectable()
export class WorldRuntimePlayerLocationService {
  readonly playerLocations = new Map<string, RuntimePlayerLocation>();

  getPlayerLocation(playerId: string): RuntimePlayerLocation | null {
    return this.playerLocations.get(playerId) ?? null;
  }

  setPlayerLocation(playerId: string, location: RuntimePlayerLocation): void {
    this.playerLocations.set(playerId, location);
  }

  clearPlayerLocation(playerId: string): void {
    this.playerLocations.delete(playerId);
  }

  getPlayerLocationCount(): number {
    return this.playerLocations.size;
  }

  listConnectedPlayerIds(): IterableIterator<string> {
    return this.playerLocations.keys();
  }

  resetState(): void {
    this.playerLocations.clear();
  }
}
