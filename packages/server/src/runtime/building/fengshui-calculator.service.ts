import {
  FENGSHUI_BASE_SCORE,
  FENGSHUI_CONTROLS,
  FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE,
  FENGSHUI_ELEMENT_INDEX,
  FENGSHUI_ELEMENT_KEYS,
  FENGSHUI_GENERATES,
  FENGSHUI_GRADE_THRESHOLDS,
  FENGSHUI_SCORE_MAX,
  FENGSHUI_SCORE_MIN,
  type CompiledBuildingCatalog,
  type FengShuiReason,
  type FengShuiReasonSeverity,
  type FengShuiSnapshot,
  type FiveElement,
  type RoomInstance,
  type RoomRole,
} from '@mud/shared';

export interface RoomAggregate {
  roomId: string;
  area: number;
  perimeter: number;
  doorCount: number;
  windowCount: number;
  roofCoverage: number;
  elementVector: Int32Array;
  traitCounts: Map<number, number>;
  comfort: number;
  stability: number;
  qiRaw: number;
  shaRaw: number;
  integrityPenalty: number;
  formationScore: number;
  topologyRevision: number;
  aggregateRevision: number;
}

export type FengShuiMetricKey =
  | 'area'
  | 'perimeter'
  | 'doorCount'
  | 'windowCount'
  | 'roofCoverage'
  | 'comfort'
  | 'stability'
  | 'qiDensity'
  | 'shaRaw'
  | 'integrityPenalty'
  | 'formationScore';

export type FengShuiCondition =
  | { roomRoleIs: RoomRole }
  | { enclosedIs: boolean }
  | { traitAtLeast: [string, number] }
  | { traitMissing: string }
  | { metricGte: [FengShuiMetricKey, number] }
  | { metricLte: [FengShuiMetricKey, number] }
  | { primaryElementIs: FiveElement }
  | { elementGeneratesFunction: true }
  | { elementConflictsFunction: true };

export interface FengShuiRuleDef {
  id: string;
  priority?: number;
  when: FengShuiCondition[];
  scoreDelta: number;
  capGroup?: string;
  reasonCode: string;
  severity: FengShuiReasonSeverity;
}

export interface CompiledFengShuiRule {
  id: string;
  priority: number;
  when: CompiledFengShuiCondition[];
  scoreDelta: number;
  capGroup?: string;
  reasonCode: string;
  severity: FengShuiReasonSeverity;
}

type CompiledFengShuiCondition =
  | { kind: 'roomRoleIs'; role: RoomRole }
  | { kind: 'enclosedIs'; enclosed: boolean }
  | { kind: 'traitAtLeast'; traitId: number; count: number }
  | { kind: 'traitMissing'; traitId: number }
  | { kind: 'metricGte'; metric: FengShuiMetricKey; value: number }
  | { kind: 'metricLte'; metric: FengShuiMetricKey; value: number }
  | { kind: 'primaryElementIs'; element: FiveElement }
  | { kind: 'elementGeneratesFunction' }
  | { kind: 'elementConflictsFunction' };

export class FengShuiCalculatorService {
  compileRules(catalog: CompiledBuildingCatalog, rules: readonly FengShuiRuleDef[]): CompiledFengShuiRule[] {
    return compileFengShuiRules(catalog, rules);
  }

  calculate(
    room: RoomInstance,
    aggregate: RoomAggregate,
    rules: readonly CompiledFengShuiRule[],
    options: { instanceId?: string; updatedAtTick?: number; revision?: number } = {},
  ): FengShuiSnapshot {
    return calculateFengShuiSnapshot(room, aggregate, rules, options);
  }
}

export function compileFengShuiRules(
  catalog: CompiledBuildingCatalog,
  rules: readonly FengShuiRuleDef[],
): CompiledFengShuiRule[] {
  return (Array.isArray(rules) ? rules : []).map((rule, index) => ({
    id: normalizeRequiredText(rule.id, `fengshui_rules[${index}].id`),
    priority: normalizeInt(rule.priority, 0),
    when: (Array.isArray(rule.when) ? rule.when : []).map((condition) => compileCondition(catalog, condition)),
    scoreDelta: normalizeInt(rule.scoreDelta, 0),
    capGroup: normalizeOptionalText(rule.capGroup) || undefined,
    reasonCode: normalizeRequiredText(rule.reasonCode, `${rule.id}.reasonCode`),
    severity: rule.severity,
  })).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function calculateFengShuiSnapshot(
  room: RoomInstance,
  aggregate: RoomAggregate,
  rules: readonly CompiledFengShuiRule[],
  options: { instanceId?: string; updatedAtTick?: number; revision?: number } = {},
): FengShuiSnapshot {
  const primaryElement = resolvePrimaryElement(aggregate.elementVector);
  const functionElement = FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE[room.role] ?? 'neutral';
  const context = { room, aggregate, primaryElement, functionElement };
  const reasons: FengShuiReason[] = [];
  let score = FENGSHUI_BASE_SCORE;
  let shapeScore = 0;
  let enclosureScore = 0;
  let qiScore = 0;
  let shaScore = 0;
  let comfortScore = 0;
  let integrityScore = 0;
  let elementScore = 0;
  let formationScore = normalizeInt(aggregate.formationScore, 0);

  for (const rule of rules) {
    if (!rule.when.every((condition) => evaluateCondition(condition, context))) {
      continue;
    }
    score += rule.scoreDelta;
    reasons.push({
      code: rule.reasonCode,
      delta: rule.scoreDelta,
      severity: rule.severity,
    });
    const code = rule.reasonCode;
    if (code.includes('shape') || code.includes('area')) shapeScore += rule.scoreDelta;
    else if (code.includes('enclosure') || code.includes('closed') || code.includes('door')) enclosureScore += rule.scoreDelta;
    else if (code.includes('qi')) qiScore += rule.scoreDelta;
    else if (code.includes('sha')) shaScore += Math.abs(Math.min(0, rule.scoreDelta));
    else if (code.includes('comfort')) comfortScore += rule.scoreDelta;
    else if (code.includes('integrity') || code.includes('broken')) integrityScore += rule.scoreDelta;
    else if (code.includes('element')) elementScore += rule.scoreDelta;
    else if (code.includes('formation')) formationScore += rule.scoreDelta;
  }

  score = clamp(score - Math.max(0, aggregate.integrityPenalty), FENGSHUI_SCORE_MIN, FENGSHUI_SCORE_MAX);
  if (aggregate.integrityPenalty > 0) {
    integrityScore -= aggregate.integrityPenalty;
    reasons.push({
      code: 'integrity_penalty',
      delta: -aggregate.integrityPenalty,
      severity: 'bad',
    });
  }

  return {
    instanceId: options.instanceId ?? room.instanceId,
    roomId: room.id,
    score,
    grade: resolveFengShuiGrade(score),
    primaryElement,
    functionElement,
    shapeScore,
    enclosureScore,
    qiScore,
    shaScore,
    comfortScore,
    integrityScore,
    elementScore,
    formationScore,
    reasons,
    revision: normalizeInt(options.revision, aggregate.aggregateRevision),
    updatedAtTick: normalizeInt(options.updatedAtTick, 0),
  };
}

function compileCondition(catalog: CompiledBuildingCatalog, condition: FengShuiCondition): CompiledFengShuiCondition {
  if ('roomRoleIs' in condition) return { kind: 'roomRoleIs', role: condition.roomRoleIs };
  if ('enclosedIs' in condition) return { kind: 'enclosedIs', enclosed: condition.enclosedIs };
  if ('traitAtLeast' in condition) {
    const [trait, count] = condition.traitAtLeast;
    return {
      kind: 'traitAtLeast',
      traitId: resolveRuleTraitId(catalog, trait),
      count: Math.max(0, normalizeInt(count, 0)),
    };
  }
  if ('traitMissing' in condition) return { kind: 'traitMissing', traitId: resolveRuleTraitId(catalog, condition.traitMissing) };
  if ('metricGte' in condition) return { kind: 'metricGte', metric: condition.metricGte[0], value: Number(condition.metricGte[1]) || 0 };
  if ('metricLte' in condition) return { kind: 'metricLte', metric: condition.metricLte[0], value: Number(condition.metricLte[1]) || 0 };
  if ('primaryElementIs' in condition) return { kind: 'primaryElementIs', element: condition.primaryElementIs };
  if ('elementGeneratesFunction' in condition) return { kind: 'elementGeneratesFunction' };
  if ('elementConflictsFunction' in condition) return { kind: 'elementConflictsFunction' };
  throw new Error('fengshui_rule_condition_invalid');
}

function evaluateCondition(
  condition: CompiledFengShuiCondition,
  context: {
    room: RoomInstance;
    aggregate: RoomAggregate;
    primaryElement: FiveElement;
    functionElement: FiveElement;
  },
): boolean {
  switch (condition.kind) {
    case 'roomRoleIs':
      return context.room.role === condition.role;
    case 'enclosedIs':
      return context.room.enclosed === condition.enclosed;
    case 'traitAtLeast':
      return (context.aggregate.traitCounts.get(condition.traitId) ?? 0) >= condition.count;
    case 'traitMissing':
      return (context.aggregate.traitCounts.get(condition.traitId) ?? 0) <= 0;
    case 'metricGte':
      return readMetric(context.room, context.aggregate, condition.metric) >= condition.value;
    case 'metricLte':
      return readMetric(context.room, context.aggregate, condition.metric) <= condition.value;
    case 'primaryElementIs':
      return context.primaryElement === condition.element;
    case 'elementGeneratesFunction':
      return generates(context.primaryElement, context.functionElement);
    case 'elementConflictsFunction':
      return conflicts(context.primaryElement, context.functionElement);
    default:
      return false;
  }
}

function readMetric(room: RoomInstance, aggregate: RoomAggregate, metric: FengShuiMetricKey): number {
  switch (metric) {
    case 'area':
      return room.area;
    case 'perimeter':
      return room.perimeter;
    case 'doorCount':
      return room.doorCount;
    case 'windowCount':
      return room.windowCount;
    case 'roofCoverage':
      return aggregate.roofCoverage || room.roofCoverageRatio;
    case 'comfort':
      return aggregate.comfort;
    case 'stability':
      return aggregate.stability;
    case 'qiDensity':
      return room.area > 0 ? aggregate.qiRaw / room.area : 0;
    case 'shaRaw':
      return aggregate.shaRaw;
    case 'integrityPenalty':
      return aggregate.integrityPenalty;
    case 'formationScore':
      return aggregate.formationScore;
    default:
      return 0;
  }
}

function resolvePrimaryElement(vector: Int32Array): FiveElement {
  let bestElement: FiveElement = 'neutral';
  let bestValue = 0;
  for (const element of FENGSHUI_ELEMENT_KEYS) {
    const value = vector[FENGSHUI_ELEMENT_INDEX[element]] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestElement = element;
    }
  }
  return bestElement;
}

function generates(source: FiveElement, target: FiveElement): boolean {
  return source !== 'neutral' && target !== 'neutral' && FENGSHUI_GENERATES[source] === target;
}

function conflicts(source: FiveElement, target: FiveElement): boolean {
  return source !== 'neutral'
    && target !== 'neutral'
    && (FENGSHUI_CONTROLS[source] === target || FENGSHUI_CONTROLS[target] === source);
}

function resolveFengShuiGrade(score: number) {
  for (const threshold of FENGSHUI_GRADE_THRESHOLDS) {
    if (score >= threshold.minScore) {
      return threshold.grade;
    }
  }
  return 'disaster' as const;
}

function resolveRuleTraitId(catalog: CompiledBuildingCatalog, trait: string): number {
  const key = normalizeRequiredText(trait, 'fengshui_rule.trait');
  const existing = catalog.traitIdsByKey.get(key);
  if (!existing) {
    throw new Error(`fengshui_rule_unknown_trait:${key}`);
  }
  return existing;
}

function normalizeRequiredText(value: unknown, field: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`fengshui_rule_required:${field}`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
