import type { FengShuiGrade, RoomRole } from '../../fengshui-types';
import type { FiveElement } from '../../building-types';

export const FENGSHUI_ELEMENT_KEYS: readonly Exclude<FiveElement, 'neutral'>[] = [
  'metal',
  'wood',
  'water',
  'fire',
  'earth',
] as const;

export const FENGSHUI_ELEMENT_INDEX: Record<Exclude<FiveElement, 'neutral'>, number> = {
  metal: 0,
  wood: 1,
  water: 2,
  fire: 3,
  earth: 4,
};

export const FENGSHUI_GENERATES: Record<Exclude<FiveElement, 'neutral'>, Exclude<FiveElement, 'neutral'>> = {
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
  metal: 'water',
  water: 'wood',
};

export const FENGSHUI_CONTROLS: Record<Exclude<FiveElement, 'neutral'>, Exclude<FiveElement, 'neutral'>> = {
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
  metal: 'wood',
};

export const FENGSHUI_GRADE_THRESHOLDS: ReadonlyArray<{ grade: FengShuiGrade; minScore: number }> = [
  { grade: 'blessed', minScore: 850 },
  { grade: 'great_good', minScore: 700 },
  { grade: 'minor_good', minScore: 550 },
  { grade: 'plain', minScore: 350 },
  { grade: 'bad', minScore: 200 },
  { grade: 'disaster', minScore: 0 },
] as const;

export const FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE: Record<RoomRole, FiveElement> = {
  generic: 'neutral',
  outdoor: 'neutral',
  courtyard: 'wood',
  meditation: 'water',
  alchemy: 'fire',
  artifact: 'metal',
  storage: 'earth',
  bedroom: 'wood',
  sect_hall: 'earth',
  formation_core: 'neutral',
};

export const FENGSHUI_SCORE_MIN = 0;
export const FENGSHUI_SCORE_MAX = 1000;
export const FENGSHUI_BASE_SCORE = 500;
