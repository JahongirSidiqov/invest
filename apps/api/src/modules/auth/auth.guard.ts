import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common/problem.filter';
import { type AccessClaims, TokenService } from './token.service';

type AuthedRequest = Request & { auth?: AccessClaims };

/** Requires a valid access JWT in `Authorization: Bearer <token>`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'missing_token');
    }
    req.auth = await this.tokens.verifyAccess(token);
    return true;
  }
}

export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessClaims => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new AppError(HttpStatus.UNAUTHORIZED, 'missing_token');
  return auth;
});
