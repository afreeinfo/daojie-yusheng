import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { Direction } from '@mud/shared';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出玩家 session fencing 的拒绝次数与成功次数，并作为阶段 6.1 的运行态指标入口',
      excludes: '不证明真实多节点顶号风暴或 socket 导流',
      completionMapping: 'release:proof:stage6.session-fencing',
    }, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = new Pool({ connectionString: databaseUrl });
  const durableOperation = app.get(DurableOperationService);
  const playerDomainPersistence = app.get(PlayerDomainPersistenceService);
  const playerRuntime = app.get(PlayerRuntimeService);

  const playerId = `sf_${Date.now().toString(36)}`;
  const sessionId = `sf_session_${Date.now().toString(36)}`;
  const staleSessionId = `${sessionId}:stale`;
  const staleOwnerOperationIds = Array.from({ length: 10 }, (_, index) => `op:${playerId}:session-fence:owner:${index}`);
  const staleEpochOperationIds = Array.from({ length: 10 }, (_, index) => `op:${playerId}:session-fence:epoch:${index}`);
  const successOperationId = `op:${playerId}:session-fence:success`;
  const operationIds = [...staleOwnerOperationIds, ...staleEpochOperationIds, successOperationId];

  try {
    await cleanupRows(pool, playerId, operationIds);
    const freshSnapshot = playerRuntime.buildFreshPersistenceSnapshot(playerId, {
      templateId: 'yunlai_town',
      x: 12,
      y: 12,
      facing: Direction.South,
    });
    if (!freshSnapshot) {
      throw new Error('failed to build fresh player snapshot for session fencing report');
    }
    playerRuntime.hydrateFromSnapshot(playerId, sessionId, freshSnapshot as never);
    playerRuntime.syncFromWorldView(playerId, sessionId, {
      instance: { instanceId: 'public:yunlai_town', templateId: 'yunlai_town' },
      self: { x: 12, y: 12, facing: Direction.South },
    });

    const runtimePresence = playerRuntime.describePersistencePresence(playerId);
    if (!runtimePresence?.runtimeOwnerId || !Number.isFinite(runtimePresence.sessionEpoch)) {
      throw new Error('missing runtime presence for session fencing report');
    }
    await playerDomainPersistence.savePlayerPresence(playerId, runtimePresence);

    let rejectCount = 0;
    for (const operationId of staleOwnerOperationIds) {
      await expectSessionFencingReject(() => durableOperation.mutatePlayerWallet({
        operationId,
        playerId,
        expectedRuntimeOwnerId: `${runtimePresence.runtimeOwnerId}:stale`,
        expectedSessionEpoch: Number(runtimePresence.sessionEpoch),
        walletType: 'spirit_stone',
        action: 'credit',
        delta: 1,
        nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1 }],
      }));
      rejectCount += 1;
    }
    for (const operationId of staleEpochOperationIds) {
      await expectSessionFencingReject(() => durableOperation.mutatePlayerWallet({
        operationId,
        playerId,
        expectedRuntimeOwnerId: runtimePresence.runtimeOwnerId ?? '',
        expectedSessionEpoch: Number(runtimePresence.sessionEpoch) + 1,
        walletType: 'spirit_stone',
        action: 'credit',
        delta: 1,
        nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1 }],
      }));
      rejectCount += 1;
    }

    const successResult = await durableOperation.mutatePlayerWallet({
      operationId: successOperationId,
      playerId,
      expectedRuntimeOwnerId: runtimePresence.runtimeOwnerId,
      expectedSessionEpoch: Number(runtimePresence.sessionEpoch),
      walletType: 'spirit_stone',
      action: 'credit',
      delta: 1,
      nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1 }],
    });
    assert.equal(successResult.ok, true);
    assert.equal(successResult.alreadyCommitted, false);

    const replayResult = await durableOperation.mutatePlayerWallet({
      operationId: successOperationId,
      playerId,
      expectedRuntimeOwnerId: runtimePresence.runtimeOwnerId,
      expectedSessionEpoch: Number(runtimePresence.sessionEpoch),
      walletType: 'spirit_stone',
      action: 'credit',
      delta: 1,
      nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1 }],
    });
    assert.equal(replayResult.ok, true);
    assert.equal(replayResult.alreadyCommitted, true);

    const walletRow = await fetchSingleRow(pool, 'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1', [playerId]);
    assert.equal(walletRow?.wallet_type, 'spirit_stone');
    assert.equal(Number(walletRow?.balance ?? 0), 1);
    const operationRow = await fetchSingleRow(pool, 'SELECT status FROM durable_operation_log WHERE operation_id = $1', [successOperationId]);
    assert.equal(operationRow?.status, 'committed');

    const successCount = 1;
    assert.equal(rejectCount, staleOwnerOperationIds.length + staleEpochOperationIds.length);

    console.log(JSON.stringify({
      ok: true,
      playerId,
      sessionId,
      staleSessionId,
      successCount,
      rejectCount,
      totalCount: operationIds.length,
      answers: '当前已可直接验证玩家 session fencing：旧 runtime_owner_id 与旧 session_epoch 会拒绝强事务，当前 owner/epoch 可提交并支持幂等回放',
      excludes: '不证明真实多节点顶号风暴或 socket 导流',
      completionMapping: 'release:proof:stage6.session-fencing',
    }, null, 2));
  } finally {
    await cleanupRows(pool, playerId, operationIds).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

async function expectSessionFencingReject(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch (error: unknown) {
    rejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
  }
  assert.equal(rejected, true);
}

async function fetchSingleRow(
  pool: Pool,
  query: string,
  params: unknown[],
): Promise<Record<string, unknown> | null> {
  const result = await pool.query(query, params);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function cleanupRows(pool: Pool, playerId: string, operationIds: string[]): Promise<void> {
  await pool.query('DELETE FROM outbox_event WHERE operation_id = ANY($1::varchar[])', [operationIds]);
  await pool.query('DELETE FROM asset_audit_log WHERE operation_id = ANY($1::varchar[])', [operationIds]);
  await pool.query('DELETE FROM durable_operation_log WHERE operation_id = ANY($1::varchar[])', [operationIds]);
  await pool.query('DELETE FROM player_wallet WHERE player_id = $1', [playerId]);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
