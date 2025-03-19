import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contract, InterfaceAbi, Wallet } from "ethers";
import { ContractError } from "../error.types";
import { ProviderTokens } from "../providerTokens";
import { Deployment, IProviderService } from "./ethereumProvider.service";

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
        private ethereumProviderService: IProviderService,
    ) {
        this._deployment = this.ethereumProviderService.getDeployment();
    }

    public async tokenContract(wallet?: Wallet): Promise<Contract> {
        const address = this.config.get(ContractServiceSettingKeys.TOKEN_CONTRACT_ADDRESS);
        const { abi } = this._deployment.Token;
        return this.getContract(address, abi, wallet);
    }

    public async stakeContract(address: string, wallet?: Wallet): Promise<Contract> {
        const { abi } = this._deployment.Stake;
        return this.getContract(address, abi, wallet);
    }

    public async offerContract(wallet?: Wallet): Promise<Contract> {
        const address = this.config.get(ContractServiceSettingKeys.OFFER_CONTRACT_ADDRESS);
        const { abi } = this._deployment.Offer;
        return this.getContract(address, abi, wallet);
    }

    private async getContract(address: string, abi: InterfaceAbi, wallet?: Wallet) {
        const provider = this.ethereumProviderService.getProvider();
        if (wallet) {
            if (await provider.getCode(address) === "0x") {
                throw new ContractError(`Contract does not exist at ${address}`);
            }
            wallet = wallet.connect(provider);
        }
        return new Contract(address, abi, wallet ?? provider);
    }
}
