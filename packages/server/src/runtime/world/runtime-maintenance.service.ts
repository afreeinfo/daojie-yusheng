import { Injectable } from '@nestjs/common';

@Injectable()
export class RuntimeMaintenanceService {
  isRuntimeMaintenanceActive(): boolean {
    return readBooleanEnv('SERVER_RUNTIME_MAINTENANCE')
      || readBooleanEnv('RUNTIME_MAINTENANCE')
      || readBooleanEnv('SERVER_RUNTIME_RESTORE_ACTIVE');
  }
}

function readBooleanEnv(key: string): boolean {
  const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
