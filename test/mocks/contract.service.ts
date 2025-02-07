import { Contract, keccak256, Log, TransactionReceipt, TransactionResponse, Wallet, ZeroAddress } from "ethers";
import { IContractService } from "../../src/services/contract.service";

export class MockContractService implements IContractService {
    public reset() {
        MockTokenContract.reset();
    }

    public async tokenContract(wallet?: Wallet): Promise<Contract> {
        return new MockTokenContract(wallet) as any;
    }

    public async stakeContract(_address: string, _wallet?: Wallet): Promise<Contract> {
        return new MockStakeContract() as any;
    }

    public async offerContract(_wallet?: Wallet): Promise<Contract> {
        return new MockOfferContract() as any;
    }
}

export class MockTransactionRequest {
    static blockNumber = 100;

    async wait(): Promise<TransactionReceipt> {
        const blockNumber = MockTransactionRequest.blockNumber++;
        return { blockNumber, hash: keccak256(new Uint8Array([blockNumber])) } as any;
    }
}

export class MockTokenContract {
    static balances: Map<string, bigint>;
    static approvals: Map<string, [string, bigint]>;
    walletAddress: string;
    isAdmin: boolean;

    constructor(wallet?: Wallet) {
        this.walletAddress = wallet?.address ?? ZeroAddress;
        this.isAdmin = wallet?.address === "0x14791697260E4c9A71f18484C9f997B308e59325";
    }

    static reset() {
        MockTokenContract.balances = new Map<string, bigint>();
        MockTokenContract.approvals = new Map<string, [string, bigint]>();
    }

    async queryFilter(): Promise<Log[]> {
        return [];
    }

    async on(): Promise<Contract> {
        return this as any;
    }

    async off(): Promise<Contract> {
        return this as any;
    }

    async balanceOf(address: string): Promise<bigint> {
        return MockTokenContract.balances.get(address) ?? 0n;
    }

    async approve(address: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        MockTokenContract.approvals.set(this.walletAddress, [address, amount]);
        return new MockTransactionRequest();
    }

    async transfer(to: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        if (amount > await this.balanceOf(this.walletAddress)) throw new Error("Insufficient balance");
        this._updateBalance(this.walletAddress, -amount);
        this._updateBalance(to, amount);
        return new MockTransactionRequest();
    }

    async transferFrom(from: string, to: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        const [approvedAddress, approvedAmount] = MockTokenContract.approvals.get(from);
        if (approvedAddress !== this.walletAddress || approvedAmount < amount) throw new Error("Not approved");
        if (amount > await this.balanceOf(from)) throw new Error("Insufficient balance");
        this._updateBalance(from, -amount);
        this._updateBalance(to, amount);
        return new MockTransactionRequest();
    }

    async mint(to: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        if (!this.isAdmin) throw new Error("Requires administrator rights");
        this._updateBalance(to, amount);
        return new MockTransactionRequest();
    }

    async burn(amount: bigint): Promise<Partial<TransactionResponse>> {
        if (amount > await this.balanceOf(this.walletAddress)) throw new Error("Insufficient balance");
        this._updateBalance(this.walletAddress, -amount);
        return new MockTransactionRequest();
    }

    private _updateBalance(address: string, amount: bigint) {
        MockTokenContract.balances.set(address, (MockTokenContract.balances.get(address) ?? 0n) + amount);
    }
}

export class MockStakeContract {
}

export class MockOfferContract {
}
