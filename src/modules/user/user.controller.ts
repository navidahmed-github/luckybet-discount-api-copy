import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { IUserService, UserDTO } from "./user.types";
import { ProviderTokens } from "../../providerTokens";

@Controller("users")
@ApiBearerAuth()
export class UserController {
	constructor(@Inject(ProviderTokens.UserService) private userService: IUserService) {}

	@Get("all")
	@ApiOperation({ summary: "Get all users" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
		isArray: true,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async getAll(): Promise<UserDTO[]> {
		return this.userService.findAll();
	}

	@Get("me")
	@ApiOperation({ summary: "Get current user" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async getMe(@Request() req): Promise<UserDTO> {
		return this.userService.getById(req.user.id);
	}

	@Get("user/:id")
	@ApiOperation({ summary: "Get a user" })
	@ApiResponse({
		status: HttpStatus.OK,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async getById(@Param("id") id: string): Promise<UserDTO> {
		return this.userService.getById(id);
	}

	@Post()
	@ApiOperation({ summary: "Create a user" })
	@ApiResponse({
		status: HttpStatus.CREATED,
		type: UserDTO,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
	})
	async create(@Body() createUserCommand): Promise<UserDTO> {
		return this.userService.create(createUserCommand.id);
	}
}
