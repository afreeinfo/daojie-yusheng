import type { CombatEffect } from '@mud/shared';

export interface PlayerRuntimeStateStore<TPlayer = unknown> {
  players: Map<string, TPlayer>;
  pendingCombatEffectsByPlayerId: Map<string, CombatEffect[]>;
}

export function createPlayerRuntimeStateStore<TPlayer = unknown>(): PlayerRuntimeStateStore<TPlayer> {
  return {
    players: new Map<string, TPlayer>(),
    pendingCombatEffectsByPlayerId: new Map<string, CombatEffect[]>(),
  };
}
