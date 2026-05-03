// @ts-nocheck

const assert = require('node:assert/strict');

const {
  fenceInstanceRuntime,
  syncAllInstanceLeases,
  syncInstanceLease,
} = require('../runtime/world/world-runtime-instance-lease.helpers');

async function main() {
  const contained = await verifyLeaseSyncErrorContained();
  const degraded = await verifyLocalLeaseDegradeAndRecover();
  const missingTemplate = await verifyMissingTemplateCatalogIsQuarantined();

  console.log(JSON.stringify({
    ok: true,
    containedLeaseSyncError: contained.containedLeaseSyncError,
    degradedLeaseRecovered: degraded.degradedLeaseRecovered,
    missingTemplateQuarantined: missingTemplate.missingTemplateQuarantined,
    answers: '实例 lease 周期同步遇到 PostgreSQL 续约异常时会记录并继续；本节点 lease 过期时真实写路径进入 lease_degraded 保活，不卸载实例，catalog 续约恢复后重新变为 leased；实例目录引用已退役地图模板时会隔离为 template_missing 并清掉 lease，不反复接管',
    excludes: '不证明真实 PostgreSQL 网络质量、跨节点 failover、Swarm 调度或生产数据库锁等待来源',
  }, null, 2));
}

async function verifyLeaseSyncErrorContained() {
  const warnings = [];
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:local',
      leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
      ownershipEpoch: 1,
      runtimeStatus: 'leased',
      status: 'active',
      persistentPolicy: 'persistent',
    },
  };
  const runtime = {
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async renewInstanceLease() {
        throw new Error('simulated pg lease renewal timeout');
      },
      async listInstanceCatalogEntries() {
        return [];
      },
    },
    listInstanceEntries() {
      return [['public:smoke_instance', instance]];
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:smoke_instance' ? instance : null;
    },
  };

  await syncAllInstanceLeases(runtime);

  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.ok(warnings.some((message) => message.includes('simulated pg lease renewal timeout')));

  return {
    containedLeaseSyncError: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyLocalLeaseDegradeAndRecover() {
  const warnings = [];
  let deleted = false;
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:expired-local',
      leaseExpireAt: new Date(Date.now() - 30_000).toISOString(),
      ownershipEpoch: 3,
      runtimeStatus: 'leased',
      status: 'active',
      persistentPolicy: 'persistent',
    },
  };
  const runtime = {
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
      error(message) {
        throw new Error(`unexpected fence error log: ${message}`);
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async renewInstanceLease() {
        return true;
      },
      async listInstanceCatalogEntries() {
        return [];
      },
    },
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime() {
        deleted = true;
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:expired_local_lease' ? instance : null;
    },
  };

  fenceInstanceRuntime(runtime, 'public:expired_local_lease', 'advance_frame_lease_check_failed');
  assert.equal(deleted, false);
  assert.equal(instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(instance.meta.status, 'active');
  assert.ok(warnings.some((message) => message.includes('续租降级')));

  await syncInstanceLease(runtime, 'public:expired_local_lease');
  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.ok(Date.parse(instance.meta.leaseExpireAt) > Date.now());

  return {
    degradedLeaseRecovered: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyMissingTemplateCatalogIsQuarantined() {
  const warnings = [];
  const marked = [];
  const catalogEntry = {
    instance_id: 'public:removed_map',
    template_id: 'removed_map',
    persistent_policy: 'persistent',
    status: 'active',
    runtime_status: 'leased',
    assigned_node_id: 'old-node',
    lease_token: 'old-lease',
    lease_expire_at: new Date(Date.now() - 10_000).toISOString(),
  };
  const runtime = {
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    templateRepository: {
      has(templateId) {
        return templateId !== 'removed_map';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async listInstanceCatalogEntries() {
        return [catalogEntry];
      },
      async markInstanceTemplateMissing(input) {
        marked.push(input);
        catalogEntry.status = 'active';
        catalogEntry.runtime_status = 'template_missing';
        catalogEntry.assigned_node_id = null;
        catalogEntry.lease_token = null;
        catalogEntry.lease_expire_at = null;
        return true;
      },
      async claimInstanceLease() {
        throw new Error('missing template catalog entry must not claim lease');
      },
    },
    listInstanceEntries() {
      return [];
    },
    getInstanceRuntime() {
      return null;
    },
  };

  await syncAllInstanceLeases(runtime);
  assert.deepEqual(marked, [{ instanceId: 'public:removed_map', templateId: 'removed_map' }]);
  assert.equal(catalogEntry.runtime_status, 'template_missing');
  assert.equal(catalogEntry.assigned_node_id, null);
  assert.equal(catalogEntry.lease_token, null);
  assert.equal(catalogEntry.lease_expire_at, null);
  assert.ok(warnings.some((message) => message.includes('已标记为待内容恢复')));

  const warningCount = warnings.length;
  await syncAllInstanceLeases(runtime);
  assert.equal(marked.length, 1);
  assert.equal(warnings.length, warningCount);

  return {
    missingTemplateQuarantined: true,
    runtimeStatus: catalogEntry.runtime_status,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
