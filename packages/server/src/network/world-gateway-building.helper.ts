// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayBuildingHelper = void 0;
const shared_1 = require("@mud/shared");

class WorldGatewayBuildingHelper {
    gateway;

    constructor(gateway) {
        this.gateway = gateway;
    }

    handleBuildPlaceIntent(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleBuildPlaceIntent(playerId, payload);
            client.emit(shared_1.S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(shared_1.S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUILD_PLACE_FAILED', error);
        }
    }

    handleBuildDeconstruct(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleBuildDeconstructIntent(playerId, payload);
            client.emit(shared_1.S2C.BuildResult, result);
            if (result?.ok === true) {
                client.emit(shared_1.S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUILD_DECONSTRUCT_FAILED', error);
        }
    }

    handleRoomSetRole(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = this.gateway.worldRuntimeService.handleRoomSetRoleIntent(playerId, payload);
            if (result?.ok !== true) {
                client.emit(shared_1.S2C.BuildResult, result);
                return;
            }
            client.emit(shared_1.S2C.RoomSummaryPatch, this.gateway.worldRuntimeService.buildCurrentRoomSummaryPatch(playerId));
            const view = this.gateway.worldRuntimeService.buildFengShuiObserveView(playerId, { roomId: payload?.roomId, overlay: false });
            if (view?.detail) {
                client.emit(shared_1.S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'ROOM_SET_ROLE_FAILED', error);
        }
    }

    handleFengShuiObserve(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const view = this.gateway.worldRuntimeService.buildFengShuiObserveView(playerId, payload);
            if (view?.overlay) {
                client.emit(shared_1.S2C.FengShuiOverlayPatch, view.overlay);
            }
            if (view?.detail) {
                client.emit(shared_1.S2C.FengShuiDetail, view.detail);
            }
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'FENGSHUI_OBSERVE_FAILED', error);
        }
    }
}

exports.WorldGatewayBuildingHelper = WorldGatewayBuildingHelper;
export { WorldGatewayBuildingHelper };
