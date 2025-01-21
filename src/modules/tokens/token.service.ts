import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProviderTokens } from "../../providerTokens";
import { Token } from "../../entities/token.entity";
import { IContractService } from "../../services/contract.service";
import { IWalletService } from "../../services/wallet.service";
import { IUserService } from "../user/user.types";
import { ITokenService } from "./token.types";

@Injectable()
export class TokenService implements ITokenService {
    private readonly logger = new Logger(TokenService.name);

    constructor(
        @Inject(ProviderTokens.UserService)
        private userService: IUserService,

        @Inject(ProviderTokens.ContractService)
        private contractService: IContractService,

        @Inject(ProviderTokens.WalletService)
        private walletService: IWalletService,

        @InjectRepository(Token)
        private tokenRepository: Repository<Token>,
    ) { }

    public async getBalance(userId: string): Promise<bigint> {
        const wallet = await this.userService.getUserWallet(userId);
        const token = await this.contractService.tokenContract();
        return BigInt(await token.balanceOf(wallet.address));
    }

    public async transfer(userId: string, to: string, amount: bigint): Promise<void> {
    }

    public async mint(to: string, amount: bigint): Promise<void> {
        const admin = this.walletService.getAdminWallet();
        const token = await this.contractService.tokenContract(admin);
        await token.mint(to, amount);
    }
}
