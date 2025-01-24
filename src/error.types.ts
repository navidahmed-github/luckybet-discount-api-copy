// String values used in user-facing error messages
export enum EntityNames {
	User = "User"
}

//=== Abstract Error classes
export abstract class EntityCannotGetError extends Error {
	constructor(private entity: string, private entityId: string, msg: string) {
		super(`Cannot get ${entity} ${entityId}: ${msg}`);
		this.message = `Cannot get ${entity} ${entityId}: ${msg}`;
		this.name = EntityCannotGetError.name;
	}

    get data(): unknown {
		return {
			entity: this.entity,
			entityId: this.entityId,
		};
	}
}

export abstract class EntityMissingIdError extends Error {
	constructor(entity: string) {
		super(`${entity} ID is missing`);
		this.name = EntityMissingIdError.name;
	}
}

export class EntityNotFoundError extends EntityCannotGetError {
	constructor(entity: string, entityId: string) {
		super(entity, entityId, `No ${entity} with ID "${entityId}"`);
		this.name = EntityNotFoundError.name;
	}
}

//=== User errors
export class UserNotFoundError extends EntityNotFoundError {
	constructor(id: string) {
		super(EntityNames.User, id);
		this.name = UserNotFoundError.name;
	}
}

export class UserMissingIdError extends EntityMissingIdError {
	constructor() {
		super(EntityNames.User);
		this.name = UserMissingIdError.name;
	}
}

//=== Address errors
export class DestinationInvalidError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = DestinationInvalidError.name;
	}
}
