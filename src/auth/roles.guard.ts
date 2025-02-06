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
			// !! need to confirm expiry checked
			const { sub, role, partner } = await this._jwtService.verifyAsync(token);
			if (!sub) {
				this.throwUnauthorized("Invalid JWT: No user identifier");
			}
			if (Array.isArray(role)) {
				this.throwUnauthorized("Invalid JWT: Only one active role allowed")
			}
			request['user'] = { id: sub, role, partner };
			return requiredRoles.includes(role);
		} catch (err) {
			this.throwUnauthorized(`Invalid JWT: ${err.message}`)
		}
	}

	private throwUnauthorized(msg: string) {
		Logger.warn(msg);
		throw new UnauthorizedException(msg);
	}
}
