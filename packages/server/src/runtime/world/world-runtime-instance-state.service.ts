import { Injectable } from '@nestjs/common';

@Injectable()
export class WorldRuntimeInstanceStateService<TInstance = unknown> {
  readonly instances = new Map<string, TInstance>();

  getInstanceRuntime(instanceId: string): TInstance | null {
    return this.instances.get(instanceId) ?? null;
  }

  setInstanceRuntime(instanceId: string, instance: TInstance): void {
    this.instances.set(instanceId, instance);
  }

  deleteInstanceRuntime(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  listInstanceRuntimes(): IterableIterator<TInstance> {
    return this.instances.values();
  }

  listInstanceEntries(): IterableIterator<[string, TInstance]> {
    return this.instances.entries();
  }

  getInstanceCount(): number {
    return this.instances.size;
  }

  resetState(): void {
    this.instances.clear();
  }
}
