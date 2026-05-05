// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFengShuiObserveView = exports.buildCurrentRoomSummaryPatch = exports.handleRoomSetRoleIntent = exports.listBuildingOperationAudit = exports.handleBuildDeconstructIntent = exports.handleBuildPlaceIntent = void 0;

function handleBuildPlaceIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    const operationKey = buildBuildingOperationKey('place', playerId, requestId);
    const replay = runtime.buildingOperationResultsByKey.get(operationKey);
    if (replay) {
        return { ...replay, duplicate: true };
    }
    const context = resolvePlayerBuildingContext(runtime, playerId);
    if (!context.instance?.meta?.persistent) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'instance_not_persistent' }, { action: 'place', playerId, instanceId: context.instance?.meta?.instanceId ?? null });
    }
    const defId = normalizeBuildingRequestId(payload?.defId);
    const compiled = context.instance.buildingCatalog?.defById?.get?.(defId);
    if (!compiled) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_def_not_found' }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    const existing = context.instance.buildingById?.get?.(requestId);
    if (existing) {
        return { requestId, ok: true, building: toBuildingInstanceView(existing), duplicate: true };
    }
    const missing = findMissingBuildingCost(context.player, compiled);
    if (missing) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: `material_insufficient:${missing.itemId}:${missing.missing}` }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    const result = context.instance.placeBuildingInstance({
        requestId,
        defId,
        x: payload?.x,
        y: payload?.y,
        rotation: payload?.rotation,
        ownerPlayerId: playerId,
        ownerSectId: context.player?.sectId ?? null,
    });
    if (!result?.ok) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: result?.reason ?? 'build_failed' }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    try {
        consumeBuildingCost(runtime.playerRuntimeService, playerId, compiled);
    }
    catch (error) {
        context.instance.deconstructBuildingInstance?.(result.building?.id);
        throw error;
    }
    return recordBuildingOperation(runtime, operationKey, {
        requestId,
        ok: true,
        building: toBuildingInstanceView(result.building),
        consumedItems: buildConsumedItemViews(compiled),
    }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId, buildingId: result.building?.id ?? null });
}
exports.handleBuildPlaceIntent = handleBuildPlaceIntent;

function handleBuildDeconstructIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    const operationKey = buildBuildingOperationKey('deconstruct', playerId, requestId);
    const replay = runtime.buildingOperationResultsByKey.get(operationKey);
    if (replay) {
        return { ...replay, duplicate: true };
    }
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const buildingId = normalizeBuildingRequestId(payload?.buildingId);
    const building = context.instance.buildingById?.get?.(buildingId);
    if (!building) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_not_found' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    if (building.ownerPlayerId && building.ownerPlayerId !== playerId) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_owner_mismatch' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    const result = context.instance.deconstructBuildingInstance(buildingId);
    return recordBuildingOperation(runtime, operationKey, {
        requestId,
        ok: result?.ok === true,
        reason: result?.ok === true ? undefined : result?.reason ?? 'deconstruct_failed',
    }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
}
exports.handleBuildDeconstructIntent = handleBuildDeconstructIntent;

function listBuildingOperationAudit(runtime, limit = 50) {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
    return runtime.buildingOperationAuditLog.slice(-normalizedLimit).reverse().map((entry) => ({ ...entry }));
}
exports.listBuildingOperationAudit = listBuildingOperationAudit;

function handleRoomSetRoleIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const result = context.instance.setRoomRole?.(payload?.roomId, payload?.role);
    return {
        requestId,
        ok: result?.ok === true,
        reason: result?.ok === true ? undefined : result?.reason ?? 'room_set_role_failed',
    };
}
exports.handleRoomSetRoleIntent = handleRoomSetRoleIntent;

function buildCurrentRoomSummaryPatch(runtime, playerId) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    return {
        instanceId: context.instance.meta.instanceId,
        revision: context.instance.getPersistenceRevision?.() ?? 0,
        adds: context.instance.listRoomSummaries?.().map(toRoomSummaryView) ?? [],
        updates: [],
        removes: [],
    };
}
exports.buildCurrentRoomSummaryPatch = buildCurrentRoomSummaryPatch;

function buildFengShuiObserveView(runtime, playerId, payload) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const roomId = typeof payload?.roomId === 'string' && payload.roomId.trim() ? payload.roomId.trim() : '';
    const hasExplicitPoint = Number.isFinite(Number(payload?.x)) || Number.isFinite(Number(payload?.y));
    const shouldBuildDetail = Boolean(roomId || hasExplicitPoint || payload?.overlay !== true);
    const x = shouldBuildDetail && Number.isFinite(Number(payload?.x)) ? Math.trunc(Number(payload.x)) : context.instance.playersById.get(playerId)?.x;
    const y = shouldBuildDetail && Number.isFinite(Number(payload?.y)) ? Math.trunc(Number(payload.y)) : context.instance.playersById.get(playerId)?.y;
    const snapshot = shouldBuildDetail && roomId
        ? context.instance.getFengShuiSnapshot?.(roomId)
        : shouldBuildDetail
            ? context.instance.getFengShuiSnapshotAt?.(x, y)
            : null;
    const room = snapshot?.roomId ? context.instance.roomsById?.get?.(snapshot.roomId) : null;
    return {
        detail: room && snapshot
            ? { room: toRoomSummaryView(room), fengShui: snapshot }
            : null,
        overlay: payload?.overlay === true ? buildFengShuiOverlayPatch(context.instance, playerId) : null,
    };
}
exports.buildFengShuiObserveView = buildFengShuiObserveView;

function resolvePlayerBuildingContext(runtime, playerId) {
    const location = runtime.getPlayerLocationOrThrow(playerId);
    const instance = runtime.getInstanceRuntimeOrThrow(location.instanceId);
    const player = runtime.playerRuntimeService.getPlayer(playerId);
    if (!player) {
        throw new Error(`player_not_found:${playerId}`);
    }
    return { location, instance, player };
}
function normalizeBuildingRequestId(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
function buildBuildingOperationKey(action, playerId, requestId) {
    return `${action}:${playerId}:${requestId}`;
}
function recordBuildingOperation(runtime, operationKey, result, meta) {
    const stableResult = { ...result };
    runtime.buildingOperationResultsByKey.set(operationKey, stableResult);
    runtime.buildingOperationAuditLog.push({
        operationKey,
        action: meta?.action ?? 'unknown',
        playerId: meta?.playerId ?? null,
        instanceId: meta?.instanceId ?? null,
        defId: meta?.defId ?? null,
        buildingId: meta?.buildingId ?? null,
        ok: stableResult.ok === true,
        reason: stableResult.reason ?? null,
        tick: runtime.tick,
        recordedAt: Date.now(),
    });
    while (runtime.buildingOperationAuditLog.length > 1000) {
        runtime.buildingOperationAuditLog.shift();
    }
    while (runtime.buildingOperationResultsByKey.size > 1000) {
        const oldestKey = runtime.buildingOperationResultsByKey.keys().next().value;
        if (!oldestKey) break;
        runtime.buildingOperationResultsByKey.delete(oldestKey);
    }
    return stableResult;
}
function findMissingBuildingCost(player, compiled) {
    const itemIds = Array.isArray(compiled?.costItemIds) ? compiled.costItemIds : Array.from(compiled?.costItemIds ?? []);
    const counts = compiled?.costCounts ?? [];
    for (let index = 0; index < itemIds.length; index += 1) {
        const itemId = itemIds[index];
        const required = Math.max(0, Math.trunc(Number(counts[index]) || 0));
        if (!itemId || required <= 0) {
            continue;
        }
        const owned = countPlayerInventoryItem(player, itemId);
        if (owned < required) {
            return { itemId, required, owned, missing: required - owned };
        }
    }
    return null;
}
function consumeBuildingCost(playerRuntimeService, playerId, compiled) {
    const itemIds = Array.isArray(compiled?.costItemIds) ? compiled.costItemIds : Array.from(compiled?.costItemIds ?? []);
    const counts = compiled?.costCounts ?? [];
    for (let index = 0; index < itemIds.length; index += 1) {
        const itemId = itemIds[index];
        const count = Math.max(0, Math.trunc(Number(counts[index]) || 0));
        if (itemId && count > 0) {
            playerRuntimeService.consumeInventoryItemByItemId(playerId, itemId, count);
        }
    }
}
function countPlayerInventoryItem(player, itemId) {
    let total = 0;
    for (const item of Array.isArray(player?.inventory?.items) ? player.inventory.items : []) {
        if (item?.itemId === itemId) {
            total += Math.max(0, Math.trunc(Number(item.count) || 0));
        }
    }
    return total;
}
function buildConsumedItemViews(compiled) {
    const itemIds = Array.isArray(compiled?.costItemIds) ? compiled.costItemIds : Array.from(compiled?.costItemIds ?? []);
    const counts = compiled?.costCounts ?? [];
    return itemIds
        .map((itemId, index) => ({ itemId, count: Math.max(0, Math.trunc(Number(counts[index]) || 0)) }))
        .filter((entry) => entry.itemId && entry.count > 0);
}
function toBuildingInstanceView(building) {
    if (!building) {
        return undefined;
    }
    return {
        id: building.id,
        defId: building.defId,
        x: building.x,
        y: building.y,
        rotation: building.rotation,
        state: building.state,
        roomId: building.roomId ?? null,
        hp: building.hp,
        maxHp: building.maxHp,
        revision: building.revision,
    };
}
function toRoomSummaryView(room) {
    return {
        id: room.id,
        role: room.role,
        enclosed: room.enclosed === true,
        semiOutdoor: room.semiOutdoor === true,
        minX: room.minX,
        minY: room.minY,
        maxX: room.maxX,
        maxY: room.maxY,
        area: room.area,
        doorCount: room.doorCount,
        windowCount: room.windowCount,
        roofCoverageRatio: room.roofCoverageRatio,
        revision: Math.max(1, Math.trunc(Number(room.topologyRevision || room.revision || 1))),
    };
}
function buildFengShuiOverlayPatch(instance, playerId) {
    const player = instance.playersById?.get?.(playerId);
    const centerX = Number.isFinite(Number(player?.x)) ? Math.trunc(Number(player.x)) : 0;
    const centerY = Number.isFinite(Number(player?.y)) ? Math.trunc(Number(player.y)) : 0;
    const radius = 12;
    const cells = [];
    const count = Math.max(0, Math.trunc(Number(instance.tilePlane?.getCellCount?.()) || 0));
    for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
        const x = instance.tilePlane.getX(cellIndex);
        const y = instance.tilePlane.getY(cellIndex);
        if (Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) > radius) {
            continue;
        }
        const roomId = instance.roomIdsByHandle?.[instance.roomIdByCell?.[cellIndex]];
        if (!roomId) {
            continue;
        }
        const snapshot = instance.fengShuiByRoomId?.get?.(roomId);
        if (!snapshot) {
            continue;
        }
        cells.push({
            x,
            y,
            roomId,
            score: snapshot.score,
            grade: snapshot.grade,
            revision: snapshot.revision,
        });
    }
    return {
        instanceId: instance.meta.instanceId,
        revision: instance.getPersistenceRevision?.() ?? 0,
        cells,
    };
}
