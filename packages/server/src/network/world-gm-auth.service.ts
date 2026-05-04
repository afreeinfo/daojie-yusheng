import { Inject, Injectable } from '@nestjs/common';

import { GM_AUTH_CONTRACT } from '../http/native/native-gm-contract';
import { RuntimeGmAuthService } from '../runtime/gm/runtime-gm-auth.service';

interface RuntimeGmAuthPort {
  validateAccessToken(token: string | null | undefined): boolean;
}

@Injectable()
export class WorldGmAuthService {
  constructor(
    @Inject(RuntimeGmAuthService)
    private readonly gmAuthService: RuntimeGmAuthPort,
  ) {}

  validateSocketGmToken(token: string | null | undefined): boolean {
    if (GM_AUTH_CONTRACT.tokenValidatorOwner !== 'runtime_gm_auth_service') {
      return false;
    }
    return this.gmAuthService.validateAccessToken(token);
  }
}
