export const MONGO_DUPLICATE_KEY = 11000;

// String values used in user-facing error messages
export enum EntityNames {
	User = "User",
	Airdrop = "Airdrop",
	Offer = "Offer",
	Stake = "Stake"
}

//=== Abstract Error classes
export class EntityCannotCreateError extends Error {
	constructor(entity: string, msg: string) {
		super(`Cannot create ${entity}: ${msg}`);
		this.name = EntityCannotCreateError.name;
	}
}

export class EntityNotFoundError extends Error {
	constructor(entity: string, entityId: string) {
		super(`${entity} ID not found: ${entityId}`);
		this.name = EntityNotFoundError.name;
	}
}

export abstract class EntityMissingIdError extends Error {
	constructor(entity: string) {
		super(`${entity} ID is missing`);
		this.name = EntityMissingIdError.name;
	}
}

export class EntityAlreadyExistsError extends Error {
	constructor(entity: string, entityId: string) {
		super(`${entity} ID already exists: ${entityId}`);
		this.name = EntityAlreadyExistsError.name;
	}
}

//=== User errors
export class UserError extends Error {
	constructor(message: string) {
		super(message);
		this.name = UserError.name;
	}
}

export class UserCannotCreateError extends EntityCannotCreateError {
	constructor(id: string) {
		super(EntityNames.User, id);
		this.name = UserCannotCreateError.name;
	}
}

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

export class UserAlreadyExistsError extends EntityAlreadyExistsError {
	constructor(id: string) {
		super(EntityNames.User, id);
		this.name = UserAlreadyExistsError.name;
	}
}

export class UserMismatchAddressError extends UserError {
	constructor(message: string) {
		super(message);
		this.name = UserMismatchAddressError.name;
	}
}

//=== Token errors
export class AirdropCannotCreateError extends EntityCannotCreateError {
	constructor(id: string) {
		super(EntityNames.Airdrop, id);
		this.name = AirdropCannotCreateError.name;
	}
}

export class AirdropNotFoundError extends EntityNotFoundError {
	constructor(id: string) {
		super(EntityNames.Airdrop, id);
		this.name = AirdropNotFoundError.name;
	}
}

//=== Offer errors
export class OfferError extends Error {
	constructor(message: string) {
		super(message);
		this.name = OfferError.name;
	}
}

export class OfferNotFoundError extends EntityNotFoundError {
	constructor(id: string) {
		super(EntityNames.Offer, id);
		this.name = OfferNotFoundError.name;
	}
}

export class OfferTokenIdError extends OfferError {
	constructor(message: string) {
		super(message);
		this.name = OfferTokenIdError.name;
	}
}

//=== Staking errors
export class StakeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = StakeError.name;
	}
}

export class StakeCannotCreateError extends EntityCannotCreateError {
	constructor(address: string) {
		super(EntityNames.Stake, address);
		this.name = StakeCannotCreateError.name;
	}
}

export class StakeNotFoundError extends EntityNotFoundError {
	constructor(address: string) {
		super(EntityNames.Stake, address);
		this.name = StakeNotFoundError.name;
	}
}

export class StakeMissingAddressError extends EntityMissingIdError {
	constructor() {
		super(EntityNames.Stake);
		this.name = StakeMissingAddressError.name;
	}
}

export class StakeAlreadyExistsError extends EntityAlreadyExistsError {
	constructor(address: string) {
		super(EntityNames.Stake, address);
		this.name = StakeAlreadyExistsError.name;
	}
}

//=== Miscellaneous errors
export class DestinationInvalidError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = DestinationInvalidError.name;
	}
}

export class InsufficientBalanceError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = InsufficientBalanceError.name;
	}
}

export class NotApprovedError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = NotApprovedError.name;
	}
}
