// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType } = require("@mud/shared");
const { RuntimeTilePlane } = require("../runtime/map/runtime-tile-plane");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { compileBuildingDefinitions } = require("../runtime/building/building-content.repository");
const { BuildingTopologyIndex } = require("../runtime/building/building-topology-index.service");
const {
  createRuntimeTilePlaneRoomCellProvider,
  detectRooms,
} = require("../runtime/building/room-detection.service");
const {
  calculateFengShuiSnapshot,
  compileFengShuiRules,
} = require("../runtime/building/fengshui-calculator.service");

function main() {
  const catalog = compileBuildingDefinitions([
    {
      id: "stone_wall",
      name: "石墙",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: true, blocksSight: true, roomBoundary: 100 },
      visual: { tileType: TileType.Wall },
      fengShui: { elementVector: { earth: 10 }, stability: 6 },
    },
    {
      id: "wooden_door",
      name: "木门",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: false, blocksSight: false, roomBoundary: 100, opening: "door" },
      visual: { tileType: TileType.Door },
      fengShui: { elementVector: { wood: 4 }, traits: ["opening.door"] },
    },
    {
      id: "plain_floor",
      name: "地板",
      placement: { layer: "floor", footprint: [{ dx: 0, dy: 0 }] },
      topology: { roofCoverage: 100 },
      visual: { tileType: TileType.Floor },
      fengShui: { stability: 2 },
    },
    {
      id: "spirit_wood_shelf",
      name: "灵木架",
      placement: { layer: "furniture", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { wood: 30 },
        traits: ["storage.shelf", "element.wood_source"],
        comfort: 4,
      },
    },
    {
      id: "alchemy_furnace",
      name: "丹炉",
      placement: { layer: "facility", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { fire: 20 },
        traits: ["facility.alchemy.heat_source"],
        comfort: -2,
        stability: 4,
      },
    },
    {
      id: "jade_bed_extensible",
      name: "玉床",
      placement: { layer: "furniture", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { earth: 12 },
        traits: ["comfort.rest", "material.jade"],
        comfort: 18,
        stability: 8,
      },
    },
  ]);

  assert.equal(catalog.defs.length, 6);
  assert.ok(catalog.traitIdsByKey.get("facility.alchemy.heat_source") > 0);
  assert.ok(catalog.traitIdsByKey.get("comfort.rest") > 0);

  const plane = new RuntimeTilePlane(25, 64);
  const topology = new BuildingTopologyIndex(plane.getCellCapacity());
  const floor = catalog.defById.get("plain_floor");
  const wall = catalog.defById.get("stone_wall");
  const door = catalog.defById.get("wooden_door");

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const cell = plane.activateCell(x, y, TileType.Floor);
      topology.applyBuildingToCells(floor, [cell]);
    }
  }

  for (let x = 0; x < 5; x += 1) {
    topology.applyBuildingToCells(x === 2 ? door : wall, [plane.getCellIndex(x, 0)]);
    topology.applyBuildingToCells(wall, [plane.getCellIndex(x, 4)]);
  }
  for (let y = 1; y < 4; y += 1) {
    topology.applyBuildingToCells(wall, [plane.getCellIndex(0, y)]);
    topology.applyBuildingToCells(wall, [plane.getCellIndex(4, y)]);
  }

  const provider = createRuntimeTilePlaneRoomCellProvider(plane, topology);
  const detection = detectRooms(provider, {
    instanceId: "test:building-room",
    role: "alchemy",
    topologyRevision: 1,
    contentRevision: 1,
    updatedAtTick: 7,
  });

  assert.equal(detection.deferredStartCells.length, 0);
  assert.equal(detection.rooms.length, 1);
  const room = detection.rooms[0];
  assert.equal(room.enclosed, true);
  assert.equal(room.area, 9);
  assert.equal(room.doorCount, 1);
  assert.equal(room.windowCount, 0);
  assert.equal(room.roofCoverageRatio, 100);
  assert.equal(detection.roomIdByCell[plane.getCellIndex(2, 2)], 1);

  const aggregate = createAggregate(room.id);
  addCompiledContribution(aggregate, catalog.defById.get("spirit_wood_shelf"));
  addCompiledContribution(aggregate, catalog.defById.get("alchemy_furnace"));
  aggregate.area = room.area;
  aggregate.perimeter = room.perimeter;
  aggregate.doorCount = room.doorCount;
  aggregate.windowCount = room.windowCount;
  aggregate.roofCoverage = room.roofCoverageRatio;
  aggregate.qiRaw = 1800;

  const rules = compileFengShuiRules(catalog, [
    {
      id: "closed_room",
      when: [{ enclosedIs: true }],
      scoreDelta: 80,
      reasonCode: "enclosure.closed",
      severity: "good",
    },
    {
      id: "alchemy_heat_source",
      when: [{ roomRoleIs: "alchemy" }, { traitAtLeast: ["facility.alchemy.heat_source", 1] }],
      scoreDelta: 60,
      reasonCode: "trait.alchemy_heat_source",
      severity: "good",
    },
    {
      id: "element_generates_function",
      when: [{ elementGeneratesFunction: true }],
      scoreDelta: 45,
      reasonCode: "element.generates_function",
      severity: "good",
    },
    {
      id: "qi_dense",
      when: [{ metricGte: ["qiDensity", 120] }],
      scoreDelta: 40,
      reasonCode: "qi.dense",
      severity: "good",
    },
    {
      id: "rest_furniture_extensible",
      when: [{ traitAtLeast: ["comfort.rest", 1] }],
      scoreDelta: 25,
      reasonCode: "trait.rest_comfort",
      severity: "good",
    },
  ]);

  let snapshot = calculateFengShuiSnapshot(room, aggregate, rules, { revision: 1, updatedAtTick: 8 });
  assert.equal(snapshot.primaryElement, "wood");
  assert.equal(snapshot.functionElement, "fire");
  assert.equal(snapshot.grade, "great_good");
  assert.equal(snapshot.reasons.some((reason) => reason.code === "element.generates_function"), true);
  assert.equal(snapshot.reasons.some((reason) => reason.code === "trait.rest_comfort"), false);

  addCompiledContribution(aggregate, catalog.defById.get("jade_bed_extensible"));
  snapshot = calculateFengShuiSnapshot(room, aggregate, rules, { revision: 2, updatedAtTick: 9 });
  assert.equal(snapshot.reasons.some((reason) => reason.code === "trait.rest_comfort"), true);
  assert.ok(snapshot.score > 700);

  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "building_room_runtime_smoke",
    name: "建筑房间烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑房间烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, rules);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      assert.equal(instance.placeBuildingInstance({ defId: "plain_floor", x, y }).ok, true);
    }
  }
  const wallIds = [];
  for (let x = 0; x < 5; x += 1) {
    const top = instance.placeBuildingInstance({ defId: x === 2 ? "wooden_door" : "stone_wall", x, y: 0 });
    assert.equal(top.ok, true);
    if (x !== 2) wallIds.push(top.building.id);
    const bottom = instance.placeBuildingInstance({ defId: "stone_wall", x, y: 4 });
    assert.equal(bottom.ok, true);
    wallIds.push(bottom.building.id);
  }
  for (let y = 1; y < 4; y += 1) {
    const left = instance.placeBuildingInstance({ defId: "stone_wall", x: 0, y });
    const right = instance.placeBuildingInstance({ defId: "stone_wall", x: 4, y });
    assert.equal(left.ok, true);
    assert.equal(right.ok, true);
    wallIds.push(left.building.id, right.building.id);
  }
  assert.equal(instance.placeBuildingInstance({ defId: "alchemy_furnace", x: 2, y: 2 }).ok, true);
  assert.equal(instance.placeBuildingInstance({ defId: "spirit_wood_shelf", x: 1, y: 1 }).ok, true);
  const runtimeRooms = instance.listRoomSummaries();
  assert.equal(runtimeRooms.length, 1);
  assert.equal(runtimeRooms[0].enclosed, true);
  assert.equal(instance.setRoomRole(runtimeRooms[0].id, "alchemy").ok, true);
  const runtimeFengShui = instance.getFengShuiSnapshotAt(2, 2);
  assert.ok(runtimeFengShui);
  assert.equal(runtimeFengShui.reasons.some((reason) => reason.code === "trait.alchemy_heat_source"), true);
  assert.ok(instance.buildBuildingPersistenceEntries().length >= 1);
  const persistenceState = instance.buildBuildingRoomFengShuiPersistenceState();
  assert.ok(persistenceState.buildings.some((entry) => entry.cells?.some((cell) => cell.previousTileType === TileType.Floor)));
  const recoveredInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑房间恢复烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  recoveredInstance.configureBuildingRuntime(catalog, rules);
  const hydrateResult = recoveredInstance.hydrateBuildingRoomFengShuiState(persistenceState);
  assert.equal(hydrateResult.rebuilt, true);
  assert.equal(recoveredInstance.buildingById.size, instance.buildingById.size);
  assert.equal(recoveredInstance.listRoomSummaries().length, 1);
  assert.ok(recoveredInstance.getFengShuiSnapshotAt(2, 2));
  const recoveredDamagedWall = recoveredInstance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 1);
  assert.ok(recoveredDamagedWall);
  assert.equal(recoveredInstance.damageTile(recoveredDamagedWall.x, recoveredDamagedWall.y, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(recoveredInstance.listRoomSummaries().length, 0);
  assert.equal(recoveredInstance.getFengShuiSnapshotAt(2, 2), null);
  const recoveredWall = recoveredInstance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 2);
  assert.ok(recoveredWall);
  assert.equal(recoveredInstance.deconstructBuildingInstance(recoveredWall.id).ok, true);
  assert.equal(recoveredInstance.tilePlane.getTileType(recoveredInstance.toTileIndex(0, 2)), TileType.Floor);

  const wallToOpen = instance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 2);
  assert.ok(wallToOpen);
  const removed = instance.deconstructBuildingInstance(wallToOpen.id);
  assert.equal(removed.ok, true);
  const openRooms = instance.listRoomSummaries();
  assert.equal(openRooms.length, 0);
  const openedFengShui = instance.getFengShuiSnapshotAt(2, 2);
  assert.equal(openedFengShui, null);

  const staticTemplateRepository = new MapTemplateRepository();
  staticTemplateRepository.registerRuntimeMapTemplate({
    id: "static_room_damage_smoke",
    name: "静态房间破坏烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      "#####",
      "#...#",
      "+...#",
      "#...#",
      "#####",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const staticInstance = new MapInstanceRuntime({
    instanceId: "real:static_room_damage_smoke",
    template: staticTemplateRepository.getOrThrow("static_room_damage_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "静态房间破坏烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  staticInstance.configureBuildingRuntime(catalog, rules);
  const staticRooms = staticInstance.listRoomSummaries();
  assert.equal(staticRooms.length, 1);
  assert.equal(staticRooms[0].area, 9);
  assert.equal(staticRooms[0].doorCount, 1);
  const staticInitialFengShui = staticInstance.getFengShuiSnapshotAt(2, 2);
  assert.ok(staticInitialFengShui);
  const damagedWall = staticInstance.damageTile(0, 1, 1);
  assert.ok(damagedWall);
  assert.equal(damagedWall.destroyed, false);
  const staticDamagedFengShui = staticInstance.getFengShuiSnapshotAt(2, 2);
  assert.ok(staticDamagedFengShui);
  assert.ok(staticDamagedFengShui.score < staticInitialFengShui.score);
  assert.equal(staticDamagedFengShui.reasons.some((reason) => reason.code === "integrity_penalty"), true);
  const brokenWall = staticInstance.damageTile(0, 1, Number.MAX_SAFE_INTEGER);
  assert.ok(brokenWall);
  assert.equal(brokenWall.destroyed, true);
  assert.equal(staticInstance.listRoomSummaries().length, 0);
  assert.equal(staticInstance.getFengShuiSnapshotAt(2, 2), null);
  const brokenWallTileIndex = staticInstance.toTileIndex(0, 1);
  const brokenWallState = staticInstance.tileDamageByTile.get(brokenWallTileIndex);
  assert.ok(brokenWallState);
  brokenWallState.respawnLeft = 1;
  assert.equal(staticInstance.advanceTileRecovery(() => false), true);
  const restoredRooms = staticInstance.listRoomSummaries();
  assert.equal(restoredRooms.length, 1);
  assert.ok(staticInstance.getFengShuiSnapshotAt(2, 2));

  const yunlaiRepository = new MapTemplateRepository();
  yunlaiRepository.loadAll();
  const yunlaiInstance = new MapInstanceRuntime({
    instanceId: "real:yunlai_room_guard_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town"),
    monsterSpawns: [],
    kind: "public",
    persistent: false,
    createdAt: Date.now(),
    displayName: "云来镇房间守卫烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const yunlaiRooms = yunlaiInstance.listRoomSummaries();
  assert.ok(yunlaiRooms.length >= 4);
  assert.equal(yunlaiRooms.some((room) => room.area > 256 && room.roofCoverageRatio < 60), false);
  const yunlaiApothecaryRoom = yunlaiInstance.getBuildingRoomFengShuiAt(40, 38)?.room;
  assert.ok(yunlaiApothecaryRoom);
  assert.ok(yunlaiApothecaryRoom.area < 256);
  const cellarInstance = new MapInstanceRuntime({
    instanceId: "real:yunlai_cellar_room_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town_apothecary_cellar"),
    monsterSpawns: [],
    kind: "public",
    persistent: false,
    createdAt: Date.now(),
    displayName: "云来镇药铺地窖房间烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const cellarRooms = cellarInstance.listRoomSummaries();
  assert.ok(cellarRooms.length >= 1);
  assert.ok(cellarRooms.some((room) => room.area > 100 && room.doorCount >= 1));
  assert.ok(cellarInstance.getFengShuiSnapshotAt(8, 9));

  const commandTemplateRepository = new MapTemplateRepository();
  commandTemplateRepository.registerRuntimeMapTemplate({
    id: "building_command_runtime_smoke",
    name: "建筑命令烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const commandInstance = new MapInstanceRuntime({
    instanceId: "real:building_command_runtime_smoke",
    template: commandTemplateRepository.getOrThrow("building_command_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑命令烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const commandPlayer = {
    playerId: "player:building:1",
    sectId: "sect:building:1",
    hp: 100,
    inventory: {
      revision: 1,
      items: [
        { itemId: "stone", count: 4 },
        { itemId: "wood", count: 4 },
      ],
    },
  };
  commandInstance.playersById.set(commandPlayer.playerId, { playerId: commandPlayer.playerId, x: 2, y: 2 });
  const commandRuntime = Object.create(WorldRuntimeService.prototype);
  commandRuntime.tick = 77;
  commandRuntime.buildingOperationResultsByKey = new Map();
  commandRuntime.buildingOperationAuditLog = [];
  commandRuntime.playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === commandPlayer.playerId ? commandPlayer : null;
    },
    consumeInventoryItemByItemId(_playerId, itemId, count) {
      const item = commandPlayer.inventory.items.find((entry) => entry.itemId === itemId);
      assert.ok(item);
      assert.ok(item.count >= count);
      item.count -= count;
      commandPlayer.inventory.revision += 1;
    },
  };
  commandRuntime.getPlayerLocationOrThrow = () => ({ instanceId: commandInstance.meta.instanceId });
  commandRuntime.getInstanceRuntimeOrThrow = () => commandInstance;
  const placeResult = WorldRuntimeService.prototype.handleBuildPlaceIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "build:req:1",
    defId: "stone_wall",
    x: 1,
    y: 1,
  });
  assert.equal(placeResult.ok, true);
  assert.equal(placeResult.building.defId, "stone_wall");
  assert.equal(commandPlayer.inventory.items.find((entry) => entry.itemId === "stone").count, 3);
  const duplicatePlaceResult = WorldRuntimeService.prototype.handleBuildPlaceIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "build:req:1",
    defId: "stone_wall",
    x: 1,
    y: 1,
  });
  assert.equal(duplicatePlaceResult.ok, true);
  assert.equal(duplicatePlaceResult.duplicate, true);
  assert.equal(commandPlayer.inventory.items.find((entry) => entry.itemId === "stone").count, 3);
  const roomPatch = WorldRuntimeService.prototype.buildCurrentRoomSummaryPatch.call(commandRuntime, commandPlayer.playerId);
  assert.equal(roomPatch.instanceId, commandInstance.meta.instanceId);
  const observe = WorldRuntimeService.prototype.buildFengShuiObserveView.call(commandRuntime, commandPlayer.playerId, {
    x: 2,
    y: 2,
    overlay: true,
  });
  assert.ok(observe.overlay);
  const deconstructResult = WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:1",
    buildingId: placeResult.building.id,
  });
  assert.equal(deconstructResult.ok, true);
  const duplicateDeconstructResult = WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:1",
    buildingId: placeResult.building.id,
  });
  assert.equal(duplicateDeconstructResult.ok, true);
  assert.equal(duplicateDeconstructResult.duplicate, true);
  assert.ok(commandRuntime.listBuildingOperationAudit(10).length >= 2);
  assert.equal(typeof commandInstance.lastBuildingRoomRebuildStats.durationMs, "number");
  assert.equal(Array.isArray(commandInstance.buildingRoomDeferredStartCells), true);
  assert.equal(commandInstance.repairBuildingRoomFengShuiState().ok, true);

  console.log("world-runtime-building-room-fengshui-smoke passed");
}

function createAggregate(roomId) {
  return {
    roomId,
    area: 0,
    perimeter: 0,
    doorCount: 0,
    windowCount: 0,
    roofCoverage: 0,
    elementVector: new Int32Array(5),
    traitCounts: new Map(),
    comfort: 0,
    stability: 0,
    qiRaw: 0,
    shaRaw: 0,
    integrityPenalty: 0,
    formationScore: 0,
    topologyRevision: 1,
    aggregateRevision: 1,
  };
}

function addCompiledContribution(aggregate, compiled) {
  for (let index = 0; index < compiled.elementVector.length; index += 1) {
    aggregate.elementVector[index] += compiled.elementVector[index];
  }
  for (const traitId of compiled.traitIds) {
    aggregate.traitCounts.set(traitId, (aggregate.traitCounts.get(traitId) ?? 0) + 1);
  }
  aggregate.comfort += compiled.fengShuiContrib[0] ?? 0;
  aggregate.stability += compiled.fengShuiContrib[1] ?? 0;
}

main();
