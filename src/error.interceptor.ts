import {
    BadRequestException,
    CallHandler,
    ConflictException,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    InternalServerErrorException,
    Logger,
    NestInterceptor,
    NotFoundException
} from "@nestjs/common";
import { catchError, Observable } from "rxjs";
import { ContractNonceError, DestinationInvalidError, EntityAlreadyExistsError, EntityMissingIdError, EntityNotFoundError, InsufficientBalanceError, NotApprovedError, StakeWithdrawError } from "./error.types";

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            catchError(err => {
                Logger.error(err.message);
                Logger.debug(err.stack);
                Logger.verbose(`Error caught in ${context.getHandler().name}`);
                const errorData = { name: err.name, message: err.message, data: err?.data ?? {} };

                if (err instanceof EntityNotFoundError) {
                    throw new NotFoundException(errorData, err.message);
                }
                if (err instanceof ContractNonceError) {
                    // nonce error almost always indicates attempting multiple operations at once with the same wallet
                    throw new ConflictException(errorData, err.message);
                }
                if ((err instanceof EntityMissingIdError) ||
                    (err instanceof EntityAlreadyExistsError) ||
                    (err instanceof StakeWithdrawError) ||
                    (err instanceof DestinationInvalidError) ||
                    (err instanceof InsufficientBalanceError) ||
                    (err instanceof NotApprovedError)) {
                    throw new BadRequestException(errorData, err.message);
                }
                if (err.message?.toLowerCase().includes("bad request")) {
                    // output the details of the bad request, which is usually an array in the "response.message"
                    throw new HttpException({ name: err.name, data: err?.response?.message ?? [err.message] }, HttpStatus.BAD_REQUEST);
                }
                throw new InternalServerErrorException(errorData);
            }),
        );
    }
}
