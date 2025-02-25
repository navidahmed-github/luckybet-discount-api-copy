import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ROLES_KEY } from "./roles.decorator";
import { Role } from "./roles.types";

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private _jwtService: JwtService, private _reflector: Reflector) { }

	async canActivate(context: ExecutionContext): Promise<boolean> {
		try {
			const requiredRoles = this._reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
				context.getHandler(),
				context.getClass(),
			]);
			if (!requiredRoles) {
				return true;
			}

			const request = context.switchToHttp().getRequest();
			const [type, token] = request.headers.authorization?.split(' ') ?? [];
			if ((type !== 'Bearer') || !token) {
				this.throwUnauthorized("Required JWT not found in request header")
			}
			const { sub, role, partner, iat, exp } = await this._jwtService.verifyAsync(token, { clockTimestamp: Date.now() / 1000 });
			if (!sub) {
				this.throwUnauthorized("No user identifier in JWT");
			}
			if (!role || Array.isArray(role)) {
				this.throwUnauthorized("Only one active role allowed in JWT")
			}
			if (!iat) {
				this.throwUnauthorized("No issued at time in JWT");
			}
			if (!exp) {
				this.throwUnauthorized("No expiry time in JWT");
			}
			request['user'] = { id: sub, role, partner };
			const req = context.switchToHttp().getRequest();
			Logger.verbose(`Calling protected endpoint ${req.method} ${req.url} as ${role}: ${sub}`);
			return requiredRoles.includes(role);
		} catch (err) {
			if (err instanceof UnauthorizedException) throw err;
			this.throwUnauthorized(`Invalid JWT: ${err.toString()}`)
		}
	}

	private throwUnauthorized(msg: string) {
		Logger.warn(msg);
		throw new UnauthorizedException(msg);
	}
}
