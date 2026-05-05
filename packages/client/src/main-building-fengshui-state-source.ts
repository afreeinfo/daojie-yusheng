import {
  C2S,
  S2C,
  type ClientToServerEventPayload,
  type PlayerState,
  type ServerToClientEventPayload,
} from '@mud/shared';
import buildingCatalog from './constants/world/building-catalog.generated.json';
import type { MapBuildPreviewOverlayState, MapFengShuiOverlayState } from './game-map/types';
import type { SocketBuildingSender } from './network/socket-send-building';
import { detailModalHost } from './ui/detail-modal-host';

type MainBuildingFengShuiStateSourceOptions = {
  socket: SocketBuildingSender;
  setFengShuiOverlay: (overlay: MapFengShuiOverlayState | null) => void;
  setBuildPreviewOverlay: (overlay: MapBuildPreviewOverlayState | null) => void;
  getPlayer: () => PlayerState | null;
  showToast: (message: string, kind?: 'system' | 'success' | 'warn') => void;
};

type RoomSummaryPayload = NonNullable<ServerToClientEventPayload<typeof S2C.RoomSummaryPatch>['adds']>[number];
type FengShuiDetailPayload = ServerToClientEventPayload<typeof S2C.FengShuiDetail>;
type FengShuiOverlayCellPayload = ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>['cells'][number];
export type BuildingSenseQiRoomInfo = {
  roomId: string;
  roomLabel: string;
  area?: number;
  enclosed?: boolean;
  doorCount?: number;
  windowCount?: number;
  fengShuiLabel: string;
  score: number;
  grade: string;
};
const FENGSHUI_DETAIL_MODAL_OWNER = 'building-fengshui-detail';

function normalizeMaterialFailure(reason: string | undefined): string {
  if (!reason) {
    return '建造失败';
  }
  const [kind, itemId, count] = reason.split(':');
  if (kind === 'material_insufficient' && itemId) {
    return `材料不足：${itemId}${count ? ` 缺少 ${count}` : ''}`;
  }
  if (reason === 'not_in_world') {
    return '当前不在可建造世界';
  }
  if (reason === 'invalid_building_def') {
    return '建筑配置不存在';
  }
  if (reason === 'tile_blocked') {
    return '目标地块已被占用';
  }
  if (reason === 'building_not_found') {
    return '建筑不存在';
  }
  if (reason === 'not_owner') {
    return '没有该建筑的拆除权限';
  }
  return reason;
}

export function createMainBuildingFengShuiStateSource(options: MainBuildingFengShuiStateSourceOptions) {
  const rooms = new Map<string, RoomSummaryPayload>();
  let latestDetail: ServerToClientEventPayload<typeof S2C.FengShuiDetail> | null = null;
  let latestOverlay: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch> | null = null;
  let latestBuildResult: ServerToClientEventPayload<typeof S2C.BuildResult> | null = null;
  let latestOverlayCellByKey = new Map<string, FengShuiOverlayCellPayload>();
  let suppressNextFengShuiDetailUntil = 0;
  let selectedDefId = String(buildingCatalog[0]?.id ?? '');
  let selectedRotation: 0 | 90 | 180 | 270 = 0;

  function applyOverlay(data: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>): void {
    latestOverlay = data;
    latestOverlayCellByKey = new Map(data.cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
    options.setFengShuiOverlay({
      instanceId: data.instanceId,
      revision: data.revision,
      cells: data.cells.map((cell) => ({
        x: cell.x,
        y: cell.y,
        roomId: cell.roomId,
        score: cell.score,
        grade: cell.grade,
        revision: cell.revision,
      })),
    });
  }

  const api = {
    clear(): void {
      rooms.clear();
      latestDetail = null;
      latestOverlay = null;
      latestBuildResult = null;
      latestOverlayCellByKey = new Map();
      suppressNextFengShuiDetailUntil = 0;
      options.setFengShuiOverlay(null);
      options.setBuildPreviewOverlay(null);
    },

    openBuildingPanel(): void {
      openOrPatchBuildingPanel({
        selectedDefId,
        selectedRotation,
        getPlayer: options.getPlayer,
        onSelect: (defId) => {
          selectedDefId = defId;
          updateBuildPreview(options, selectedDefId, selectedRotation);
          api.openBuildingPanel();
        },
        onRotate: () => {
          selectedRotation = rotateBuilding(selectedRotation);
          updateBuildPreview(options, selectedDefId, selectedRotation);
          api.openBuildingPanel();
        },
        onPlace: () => {
          const player = options.getPlayer();
          if (!player || !selectedDefId) {
            options.showToast('当前不在可建造世界', 'warn');
            return;
          }
          options.socket.sendBuildPlaceIntent({
            requestId: `build:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            defId: selectedDefId,
            x: player.x,
            y: player.y,
            rotation: selectedRotation,
          });
          options.showToast('已提交建造意图', 'system');
          updateBuildPreview(options, selectedDefId, selectedRotation);
        },
        onObserve: () => {
          const player = options.getPlayer();
          options.socket.sendFengShuiObserve({ x: player?.x, y: player?.y, overlay: true });
          options.showToast('已请求当前位置风水', 'system');
        },
      });
      updateBuildPreview(options, selectedDefId, selectedRotation);
    },

    sendBuildPlaceIntent(payload: ClientToServerEventPayload<typeof C2S.BuildPlaceIntent>): void {
      options.socket.sendBuildPlaceIntent(payload);
    },

    sendBuildDeconstruct(payload: ClientToServerEventPayload<typeof C2S.BuildDeconstruct>): void {
      options.socket.sendBuildDeconstruct(payload);
    },

    sendRoomSetRole(payload: ClientToServerEventPayload<typeof C2S.RoomSetRole>): void {
      options.socket.sendRoomSetRole(payload);
    },

    sendFengShuiObserve(payload: ClientToServerEventPayload<typeof C2S.FengShuiObserve>): void {
      options.socket.sendFengShuiObserve(payload);
    },

    handleBuildResult(data: ServerToClientEventPayload<typeof S2C.BuildResult>): void {
      latestBuildResult = data;
      if (data.ok) {
        options.showToast(data.building ? '建造完成' : '建造请求已处理', 'success');
        updateBuildPreview(options, selectedDefId, selectedRotation);
        return;
      }
      options.showToast(normalizeMaterialFailure(data.reason), 'warn');
      updateBuildPreview(options, selectedDefId, selectedRotation);
    },

    handleRoomSummaryPatch(data: ServerToClientEventPayload<typeof S2C.RoomSummaryPatch>): void {
      for (const roomId of data.removes ?? []) {
        rooms.delete(roomId);
      }
      for (const room of data.adds ?? []) {
        rooms.set(room.id, room);
      }
      for (const room of data.updates ?? []) {
        rooms.set(room.id, room);
      }
    },

    handleFengShuiOverlayPatch(data: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>): void {
      applyOverlay(data);
    },

    handleFengShuiDetail(data: ServerToClientEventPayload<typeof S2C.FengShuiDetail>): void {
      latestDetail = data;
      rooms.set(data.room.id, data.room);
      if (Date.now() <= suppressNextFengShuiDetailUntil) {
        suppressNextFengShuiDetailUntil = 0;
        return;
      }
      openOrPatchFengShuiDetail(data);
    },

    getRooms(): readonly RoomSummaryPayload[] {
      return [...rooms.values()];
    },

    getLatestDetail(): ServerToClientEventPayload<typeof S2C.FengShuiDetail> | null {
      return latestDetail;
    },

    getLatestOverlay(): ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch> | null {
      return latestOverlay;
    },

    getLatestBuildResult(): ServerToClientEventPayload<typeof S2C.BuildResult> | null {
      return latestBuildResult;
    },

    getSenseQiRoomInfoAt(x: number, y: number): BuildingSenseQiRoomInfo | null {
      const cell = latestOverlayCellByKey.get(`${x},${y}`);
      if (!cell) {
        return null;
      }
      const room = rooms.get(cell.roomId);
      const roomLabel = room ? formatRoomRole(room.role) : `房间 ${cell.roomId.slice(0, 8)}`;
      return {
        roomId: cell.roomId,
        roomLabel,
        area: room?.area,
        enclosed: room?.enclosed,
        doorCount: room?.doorCount,
        windowCount: room?.windowCount,
        fengShuiLabel: formatGrade(cell.grade),
        score: cell.score,
        grade: cell.grade,
      };
    },

    requestSenseQiFengShuiOverlay(x?: number, y?: number): void {
      suppressNextFengShuiDetailUntil = Date.now() + 1500;
      options.socket.sendFengShuiObserve({
        overlay: true,
        ...(Number.isFinite(x) ? { x } : {}),
        ...(Number.isFinite(y) ? { y } : {}),
      });
    },
  };
  return api;
}

export type MainBuildingFengShuiStateSource = ReturnType<typeof createMainBuildingFengShuiStateSource>;

type BuildingPanelOptions = {
  selectedDefId: string;
  selectedRotation: 0 | 90 | 180 | 270;
  getPlayer: () => PlayerState | null;
  onSelect: (defId: string) => void;
  onRotate: () => void;
  onPlace: () => void;
  onObserve: () => void;
};

function openOrPatchBuildingPanel(options: BuildingPanelOptions): void {
  const modalOptions = {
    ownerId: 'building-panel',
    title: '营造',
    subtitle: `当前位置：${formatPlayerCoord(options.getPlayer())}`,
    hint: '选择建筑后在当前位置提交建造意图',
    size: 'lg' as const,
    renderBody: (body: HTMLElement) => renderBuildingPanelBody(body, options),
    onAfterRender: (body: HTMLElement, signal: AbortSignal) => bindBuildingPanelEvents(body, options, signal),
  };
  if (!detailModalHost.patch(modalOptions)) {
    detailModalHost.open(modalOptions);
  }
}

function renderBuildingPanelBody(body: HTMLElement, options: BuildingPanelOptions): void {
  const root = document.createElement('div');
  root.className = 'building-panel-modal';
  const list = document.createElement('div');
  list.className = 'building-panel-list';
  for (const def of buildingCatalog) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = def.id === options.selectedDefId ? 'building-panel-item active' : 'building-panel-item';
    button.dataset.uiKey = `building-def:${def.id}`;
    button.dataset.defId = def.id;
    button.textContent = `${def.name} · ${formatBuildingLayer(def.layer)}`;
    list.appendChild(button);
  }
  const selected = buildingCatalog.find((def) => def.id === options.selectedDefId) ?? buildingCatalog[0];
  const detail = document.createElement('div');
  detail.className = 'building-panel-detail';
  detail.appendChild(buildLine('类型', selected ? formatBuildingLayer(selected.layer) : '未选择'));
  detail.appendChild(buildLine('材料', selected ? formatCost(selected.cost) : '无'));
  detail.appendChild(buildLine('五行', selected ? formatElementVector(selected.elementVector) : '无'));
  detail.appendChild(buildLine('标签', selected?.traits?.join('、') || '无'));
  const actions = document.createElement('div');
  actions.className = 'building-panel-actions';
  actions.appendChild(buildActionButton(`旋转 ${options.selectedRotation}`, 'rotate'));
  actions.appendChild(buildActionButton('建造当前位置', 'place'));
  actions.appendChild(buildActionButton('查看风水', 'observe'));
  detail.appendChild(actions);
  root.replaceChildren(list, detail);
  body.replaceChildren(root);
}

function bindBuildingPanelEvents(body: HTMLElement, options: BuildingPanelOptions, signal: AbortSignal): void {
  body.querySelectorAll<HTMLButtonElement>('.building-panel-item[data-def-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const defId = button.dataset.defId;
      if (defId) {
        options.onSelect(defId);
      }
    }, { signal });
  });
  body.querySelectorAll<HTMLButtonElement>('.building-panel-action[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const action = button.dataset.action;
      if (action === 'rotate') {
        options.onRotate();
        return;
      }
      if (action === 'place') {
        options.onPlace();
        return;
      }
      if (action === 'observe') {
        options.onObserve();
      }
    }, { signal });
  });
}

function updateBuildPreview(options: MainBuildingFengShuiStateSourceOptions, defId: string, rotation: 0 | 90 | 180 | 270): void {
  const player = options.getPlayer();
  const def = buildingCatalog.find((entry) => entry.id === defId);
  if (!player || !def) {
    options.setBuildPreviewOverlay(null);
    return;
  }
  const cells = rotateFootprint(def.footprint ?? [{ dx: 0, dy: 0 }], rotation)
    .map((cell) => ({ x: player.x + cell.dx, y: player.y + cell.dy, ok: true }));
  options.setBuildPreviewOverlay({ defId, originX: player.x, originY: player.y, rotation, cells });
}

function rotateFootprint(footprint: Array<{ dx: number; dy: number }>, rotation: 0 | 90 | 180 | 270): Array<{ dx: number; dy: number }> {
  return footprint.map((cell) => {
    if (rotation === 90) return { dx: -cell.dy, dy: cell.dx };
    if (rotation === 180) return { dx: -cell.dx, dy: -cell.dy };
    if (rotation === 270) return { dx: cell.dy, dy: -cell.dx };
    return { dx: cell.dx, dy: cell.dy };
  });
}

function rotateBuilding(rotation: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return rotation === 0 ? 90 : rotation === 90 ? 180 : rotation === 180 ? 270 : 0;
}

function buildLine(label: string, value: string): HTMLElement {
  const line = document.createElement('div');
  line.className = 'building-panel-line';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  line.replaceChildren(labelEl, valueEl);
  return line;
}

function buildActionButton(label: string, action: 'rotate' | 'place' | 'observe'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'building-panel-action';
  button.dataset.uiKey = `building-action:${action}`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function formatPlayerCoord(player: PlayerState | null): string {
  return player ? `${player.x},${player.y}` : '未入世';
}

function formatBuildingLayer(layer: string): string {
  return { structure: '结构', floor: '地面', facility: '设施', furniture: '家具', decoration: '装饰' }[layer] ?? layer;
}

function formatCost(cost: Array<{ itemId: string; count: number }> | undefined): string {
  return cost?.length ? cost.map((entry) => `${entry.itemId} x${entry.count}`).join('、') : '无';
}

function formatElementVector(vector: Record<string, number | undefined> | undefined): string {
  return Object.entries(vector ?? {}).filter(([, value]) => Number(value) !== 0).map(([key, value]) => `${key}${value}`).join('、') || '中性';
}

function openOrPatchFengShuiDetail(data: FengShuiDetailPayload): void {
  const options = {
    ownerId: FENGSHUI_DETAIL_MODAL_OWNER,
    title: `风水：${formatGrade(data.fengShui.grade)} ${data.fengShui.score}`,
    subtitle: `${formatRoomRole(data.room.role)} · ${data.fengShui.primaryElement} / ${data.fengShui.functionElement}`,
    hint: '点击空白处关闭',
    size: 'md' as const,
    renderBody: (body: HTMLElement) => renderFengShuiDetailBody(body, data),
  };
  if (!detailModalHost.patch(options)) {
    detailModalHost.open(options);
  }
}

function renderFengShuiDetailBody(body: HTMLElement, data: FengShuiDetailPayload): void {
  const root = document.createElement('div');
  root.className = 'fengshui-detail-modal';
  const metrics = document.createElement('div');
  metrics.className = 'fengshui-detail-metrics';
  for (const entry of [
    ['面积', String(data.room.area)],
    ['门窗', `${data.room.doorCount}/${data.room.windowCount}`],
    ['封闭', data.room.enclosed ? '完整' : '开放'],
    ['形制', String(data.fengShui.shapeScore)],
    ['灵气', String(data.fengShui.qiScore)],
    ['五行', String(data.fengShui.elementScore)],
  ]) {
    const item = document.createElement('span');
    item.className = 'fengshui-detail-metric';
    item.textContent = `${entry[0]}：${entry[1]}`;
    metrics.appendChild(item);
  }
  const reasons = document.createElement('div');
  reasons.className = 'fengshui-detail-reasons';
  for (const reason of data.fengShui.reasons.slice(0, 12)) {
    const item = document.createElement('div');
    item.className = `fengshui-detail-reason is-${reason.severity}`;
    item.textContent = `${reason.delta >= 0 ? '+' : ''}${reason.delta} ${localizeReasonCode(reason.code)}`;
    reasons.appendChild(item);
  }
  root.replaceChildren(metrics, reasons);
  body.replaceChildren(root);
}

function formatGrade(grade: string): string {
  return {
    disaster: '大凶',
    bad: '小凶',
    plain: '平',
    minor_good: '小吉',
    great_good: '大吉',
    blessed: '洞天',
  }[grade] ?? grade;
}

function formatRoomRole(role: string): string {
  return {
    generic: '普通房间',
    meditation: '静室',
    alchemy: '丹房',
    bedroom: '卧房',
    storage: '仓库',
    courtyard: '庭院',
    outdoor: '室外',
  }[role] ?? role;
}

function localizeReasonCode(code: string): string {
  return {
    'enclosure.closed': '房间封闭完整',
    'enclosure.open': '房间连通外界',
    'enclosure.no_door': '封闭但缺少房门',
    'shape.area_balanced': '面积适中',
    'shape.roof_covered': '屋顶覆盖充足',
    'trait.alchemy_heat_source': '丹炉火源匹配',
    'trait.meditation_facility': '静修设施匹配',
    'trait.rest_comfort': '休息家具舒适',
    'trait.storage_shelf': '仓储设施匹配',
    'element.generates_function': '主五行生助用途',
    'element.conflicts_function': '主五行克制用途',
    'qi.dense': '灵气密度较高',
    'comfort.good': '舒适度较高',
    'sha.screen': '影壁化煞',
    integrity_penalty: '建筑完整性不足',
  }[code] ?? code;
}
