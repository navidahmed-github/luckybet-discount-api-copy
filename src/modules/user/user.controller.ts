import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Request } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
import { User } from "../../entities/user.entity";
import { CreateUserCommand, IUserService, UserDTO } from "./user.types";

@Controller("users")
@ApiBearerAuth()
export class UserController {
	constructor(
		@Inject(ProviderTokens.UserService)
		private _userService: IUserService
	) { }

	@Get()
	@Roles(Role.Admin)
	@ApiOperation({ summary: "Get all users" })
	@ApiOkResponse({
		description: "Users were returned successfully",
		type: UserDTO,
		isArray: true,
	})
	async all(): Promise<UserDTO[]> {
		return this._userService.getAll().then(u => u.map(this.toDTO));
	}

	@Get("me")
	@Roles(Role.User)
	@ApiOperation({ summary: "Get current user" })
	@ApiOkResponse({
		description: "User was returned successfully",
		type: UserDTO,
	})
	@ApiNotFoundResponse({ description: "User could not be found" })
	async me(@Request() req): Promise<UserDTO> {
		return this._userService.getByUserId(req.user.id).then(this.toDTO);
	}

	@Get(":userId")
	@Roles(Role.Admin)
	@ApiOperation({ summary: "Get a user" })
	@ApiParam({
		name: "userId",
		description: "Identifier of user to return",
		required: true,
		type: String,
	})
	@ApiOkResponse({
		description: "User was returned successfully",
		type: UserDTO,
	})
	@ApiNotFoundResponse({ description: "User could not be found" })
	@ApiBadRequestResponse({ description: "User identifier is missing" })
	async byId(@Param("userId") userId: string): Promise<UserDTO> {
		return this._userService.getByUserId(userId).then(this.toDTO);
	}

	@Post()
	@Roles(Role.Admin)
	@ApiOperation({ summary: "Create a user" })
	@ApiCreatedResponse({
		description: "User was created successfully",
		type: UserDTO,
	})
	@ApiBadRequestResponse({ description: "Missing information or user already exists" })
	@ApiInternalServerErrorResponse({ description: "User could not be saved" })
	@HttpCode(HttpStatus.CREATED)
	async create(@Body() cmd: CreateUserCommand): Promise<UserDTO> {
		return this._userService.create(cmd.id).then(this.toDTO);
	}
	
	private toDTO(user: User): UserDTO {
		return { id: user.userId, address: user.address };
	}
}
