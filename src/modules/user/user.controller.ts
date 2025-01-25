import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ProviderTokens } from "../../providerTokens";
import { Roles } from "../../auth/roles.decorator";
import { Role } from "../../auth/roles.types";
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
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
		isArray: true,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async all(): Promise<UserDTO[]> {
		return this._userService.getAll();
	}

	@Get("me")
	@Roles(Role.User)
	@ApiOperation({ summary: "Get current user" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async me(@Request() req): Promise<UserDTO> {
		return this._userService.getById(req.user.id);
	}

	@Get(":id")
	@Roles(Role.Admin)
	@ApiOperation({ summary: "Get a user" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async byId(@Param("id") id: string): Promise<UserDTO> {
		return this._userService.getById(id);
	}

	@Post()
	@Roles(Role.Admin)
	@ApiOperation({ summary: "Create a user" })
	@ApiResponse({
		status: HttpStatus.CREATED,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async create(@Body() createUserCommand: CreateUserCommand): Promise<UserDTO> {
		return this._userService.create(createUserCommand.id);
	}
}
