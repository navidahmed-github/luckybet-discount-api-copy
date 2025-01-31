import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InterfaceAbi, JsonRpcProvider } from "ethers";
import * as deployment from "../../artifacts";

export interface IProviderService {
	getProvider(): JsonRpcProvider;
	getDeployment(): Deployment;
}

export enum EthereumProviderServiceSettingKeys {
	PROVIDER_URL = "PROVIDER_URL",
}

export type Deployment = {
	Token: { abi: InterfaceAbi };
	Stake: { abi: InterfaceAbi };
	Offer: { abi: InterfaceAbi };
};

@Injectable()
export class EthereumProviderService implements IProviderService {
	private _provider: JsonRpcProvider;

	constructor(private readonly config: ConfigService) {}

	getProvider(): JsonRpcProvider {
		if (!this._provider) {
            const url = this.config.get(EthereumProviderServiceSettingKeys.PROVIDER_URL);
			this._provider = new JsonRpcProvider(url);
		}
		return this._provider;
	}

	getDeployment(): Deployment {
		return deployment as Deployment;
	}
}
