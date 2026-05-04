import { Injectable } from '@nestjs/common';

@Injectable()
export class WorldRuntimeTickProgressService {
  readonly instanceTickProgressById = new Map<string, number>();

  getProgress(instanceId: string): number {
    return this.instanceTickProgressById.get(instanceId) ?? 0;
  }

  setProgress(instanceId: string, progress: number): void {
    this.instanceTickProgressById.set(instanceId, progress);
  }

  initializeInstance(instanceId: string): void {
    this.instanceTickProgressById.set(instanceId, 0);
  }

  clearInstance(instanceId: string): void {
    this.instanceTickProgressById.delete(instanceId);
  }

  resetState(): void {
    this.instanceTickProgressById.clear();
  }
}
