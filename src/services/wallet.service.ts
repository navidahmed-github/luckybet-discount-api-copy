import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HDNodeWallet, Mnemonic, Wallet } from "ethers";
import { ProviderTokens } from "../providerTokens";
import { EthereumProviderService } from "./ethereumProvider.service";

export interface IWalletService {
	connect(wallet: Wallet): Wallet;
	getWallet(ordinal: number, connect?: boolean): Wallet;
	getAdminWallet(): Wallet;
}

export enum WalletServiceSettingKeys {
	WALLET_SERVICE_HD_WALLET_MNEMONIC = "WALLET_SERVICE_HD_WALLET_MNEMONIC",
	ADMIN_WALLET_PRIVATE_KEY = "ADMIN_WALLET_PRIVATE_KEY",
}

@Injectable()
export class WalletService implements IWalletService {
	constructor(
		private config: ConfigService,

		@Inject(ProviderTokens.EthereumProviderService)
		private ethereumProviderService: EthereumProviderService,
	) {}

	connect(wallet: Wallet) {
		return wallet.connect(this.ethereumProviderService.getProvider());
	}

	getWallet(ordinal: number, connect?: boolean): Wallet {
		const mnemonic = this.config.get(WalletServiceSettingKeys.WALLET_SERVICE_HD_WALLET_MNEMONIC);
		const path = `m/44'/60'/${ordinal}'/0/0`;
		const walletNode = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path);
		const wallet = new Wallet(walletNode.privateKey);
		return connect ? this.connect(wallet) : wallet;
	}

	getAdminWallet(): Wallet {
		const privateKey = this.config.get(WalletServiceSettingKeys.ADMIN_WALLET_PRIVATE_KEY);
		return new Wallet(privateKey);
	}
}
