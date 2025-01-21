import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contract, InterfaceAbi, Wallet } from "ethers";
import { ProviderTokens } from "../providerTokens";
import { EthereumProviderService, Deployment } from "./ethereumProvider.service";

export interface IContractService {
    tokenContract(wallet?: Wallet): Promise<Contract>;
    stakeContract(address: string, wallet?: Wallet): Promise<Contract>;
    offerContract(wallet?: Wallet): Promise<Contract>;
}

export enum ContractServiceSettingKeys {
    TOKEN_CONTRACT_ADDRESS = "TOKEN_CONTRACT_ADDRESS",
    OFFER_CONTRACT_ADDRESS = "OFFER_CONTRACT_ADDRESS",
}

@Injectable()
export class ContractService implements IContractService {
    private readonly _deployment: Deployment;

    constructor(
        private config: ConfigService,

        @Inject(ProviderTokens.EthereumProviderService)
        private ethereumProviderService: EthereumProviderService,
    ) {
        this._deployment = this.ethereumProviderService.getDeployment();
    }

    public async tokenContract(wallet?: Wallet): Promise<Contract> {
        const address = this.config.get(ContractServiceSettingKeys.TOKEN_CONTRACT_ADDRESS);
        const { abi } = this._deployment.Token;
        return this.getContract(address, abi, wallet);
    }

    public async stakeContract(address: string, wallet?: Wallet): Promise<Contract> {
        const { abi } = this._deployment.Token;
        return this.getContract(address, abi, wallet);
    }

    public async offerContract(wallet?: Wallet): Promise<Contract> {
        const address = this.config.get(ContractServiceSettingKeys.OFFER_CONTRACT_ADDRESS);
        const { abi } = this._deployment.Token;
        return this.getContract(address, abi, wallet);
    }

    private async getContract(address: string, abi: InterfaceAbi, wallet?: Wallet) {
        const provider = this.ethereumProviderService.getProvider();
        if (wallet) {
            wallet = wallet.connect(provider);
        }
        return new Contract(address, abi, wallet ?? provider);
    }
}
