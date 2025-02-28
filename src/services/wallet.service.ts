import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HDNodeWallet, JsonRpcApiProvider, Mnemonic, parseEther, Wallet } from "ethers";
import { ProviderTokens } from "../providerTokens";
import { IProviderService } from "./ethereumProvider.service";

export interface IWalletService {
	connect(wallet: Wallet): Wallet;
	getWallet(ordinal: number, connect?: boolean): Wallet;
	getAdminWallet(): Wallet;
	getLuckyBetWallet(): Wallet;
	gasWallet(wallet: Wallet): Promise<void>
}

export enum WalletServiceSettingKeys {
	WALLET_MNEMONIC = "WALLET_MNEMONIC",
	ADMIN_WALLET_PRIVATE_KEY = "ADMIN_WALLET_PRIVATE_KEY",
	GAS_STATION_WALLET_PRIVATE_KEY = "GAS_STATION_WALLET_PRIVATE_KEY",
	LUCKYBET_WALLET_PRIVATE_KEY = "LUCKYBET_WALLET_PRIVATE_KEY",
	WALLET_GAS_AMOUNT = "WALLET_GAS_AMOUNT"
}

@Injectable()
export class WalletService implements IWalletService {
	private readonly _logger = new Logger(WalletService.name);
	private readonly _provider: JsonRpcApiProvider;
	private readonly _gasStationWallet: Wallet;

	constructor(
		private config: ConfigService,

		@Inject(ProviderTokens.EthereumProviderService)
		ethereumProviderService: IProviderService,
	) {
		this._provider = ethereumProviderService.getProvider();
		this._gasStationWallet = new Wallet(config.get(WalletServiceSettingKeys.GAS_STATION_WALLET_PRIVATE_KEY), this._provider);
	}

	public connect(wallet: Wallet) {
		return wallet.connect(this._provider);
	}

	public getWallet(ordinal: number, connect?: boolean): Wallet {
		const mnemonic = this.config.get(WalletServiceSettingKeys.WALLET_MNEMONIC);
		const path = `m/44'/60'/${ordinal}'/0/0`; // use the 'account' field from BIP-44
		const walletNode = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path);
		const wallet = new Wallet(walletNode.privateKey);
		return connect ? this.connect(wallet) : wallet;
	}

	public getAdminWallet(): Wallet {
		const privateKey = this.config.get(WalletServiceSettingKeys.ADMIN_WALLET_PRIVATE_KEY);
		return new Wallet(privateKey);
	}

	public getLuckyBetWallet(): Wallet {
		const privateKey = this.config.get(WalletServiceSettingKeys.LUCKYBET_WALLET_PRIVATE_KEY);
		return new Wallet(privateKey);
	}

	public async gasWallet(wallet: Wallet): Promise<void> {
		this._logger.verbose(`Sending gas to: ${wallet.address}`);
		const amount = parseEther(this.config.get(WalletServiceSettingKeys.WALLET_GAS_AMOUNT));
		const balance = await this._provider.getBalance(wallet.address);
		if (balance > amount / 2n) {
			this._logger.verbose(`Gassing not required for: ${wallet.address}`);
			return;
		}
		await this.sendEther(wallet.address, amount);
	}

	private async sendEther(to: string, amount: bigint): Promise<void> {
		const tx = await this._gasStationWallet.sendTransaction({ to, value: amount });
		const txReceipt = await tx.wait();
		this._logger.verbose(`Sent ETH to: ${to} from gas station for amount: ${amount} with txHash: ${txReceipt.hash}`);
	}
}
