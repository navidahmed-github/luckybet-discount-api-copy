import { Contract, keccak256, Log, TransactionReceipt, TransactionResponse, Wallet, ZeroAddress } from "ethers";
import { IContractService } from "../../src/services/contract.service";
import { TRANSFER_TOPIC } from "../../src/modules/offers/offer.service";

export class MockContractService implements IContractService {
    public reset() {
        MockTokenContract.reset();
        MockOfferContract.reset();
    }

    public async tokenContract(wallet?: Wallet): Promise<Contract> {
        return new MockTokenContract(wallet) as any;
    }

    public async stakeContract(_address: string, _wallet?: Wallet): Promise<Contract> {
        return new MockStakeContract() as any;
    }

    public async offerContract(wallet?: Wallet): Promise<Contract> {
        return new MockOfferContract(wallet) as any;
    }
}

export class MockTransactionRequest {
    static blockNumber = 100;

    constructor(private args = {}) { }

    async wait(): Promise<TransactionReceipt> {
        const blockNumber = MockTransactionRequest.blockNumber++;
        return { blockNumber, hash: keccak256(new Uint8Array([blockNumber])), ...this.args } as any;
    }
}

export class MockTokenContract {
    private static balances: Map<string, bigint>;
    private static approvals: Map<string, [string, bigint]>;
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

    async approve(spender: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        MockTokenContract.approvals.set(this.walletAddress, [spender, amount]);
        return new MockTransactionRequest();
    }

    async allowance(owner: string, spender: string): Promise<bigint> {
        if (!MockTokenContract.approvals.has(owner)) return 0n;
        const [approvedAddress, approvedAmount] = MockTokenContract.approvals.get(owner);
        return (approvedAddress === spender) ? approvedAmount : 0n;
    }

    async transfer(to: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        if (amount > await this.balanceOf(this.walletAddress)) throw new Error("Insufficient balance");
        this._updateBalance(this.walletAddress, -amount);
        this._updateBalance(to, amount);
        return new MockTransactionRequest();
    }

    async transferFrom(from: string, to: string, amount: bigint): Promise<Partial<TransactionResponse>> {
        if (!MockTokenContract.approvals.has(from)) throw new Error("Not approved");
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
    private static owners: Map<bigint, string>;
    private static approvals: Map<bigint, string>;
    private static instances: Map<bigint, bigint>;
    walletAddress: string;
    isAdmin: boolean;

    constructor(wallet?: Wallet) {
        this.walletAddress = wallet?.address ?? ZeroAddress;
        this.isAdmin = wallet?.address === "0x14791697260E4c9A71f18484C9f997B308e59325";
    }

    static reset() {
        MockOfferContract.owners = new Map<bigint, string>();
        MockOfferContract.approvals = new Map<bigint, string>();
        MockOfferContract.instances = new Map<bigint, bigint>();
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
        return BigInt(this._getOwned(address).length);
    }

    async tokenOfOwnerByIndex(address: string, index: bigint) {
        if (index >= await this.balanceOf(address)) throw new Error("Index outside range");
        return this._getOwned(address)[Number(index)][0];
    }

    async approve(spender: string, tokenId: bigint): Promise<Partial<TransactionResponse>> {
        if (MockOfferContract.owners.get(tokenId) !== this.walletAddress) throw new Error("Not owner");
        MockOfferContract.approvals.set(tokenId, spender);
        return new MockTransactionRequest();
    }

    async transferFrom(from: string, to: string, tokenId: bigint): Promise<Partial<TransactionResponse>> {
        const approvedAddress = MockOfferContract.approvals.get(tokenId);
        const owner = MockOfferContract.owners.get(tokenId);
        if (owner !== this.walletAddress && (owner !== from || approvedAddress !== this.walletAddress)) throw new Error("Not approved");
        MockOfferContract.owners.set(tokenId, to);
        MockOfferContract.approvals.set(tokenId, ZeroAddress);
        return new MockTransactionRequest();
    }

    async mint(to: string, tokenType: bigint): Promise<Partial<TransactionResponse>> {
        if (!this.isAdmin) throw new Error("Requires administrator rights");
        const nextInstance = (MockOfferContract.instances.get(tokenType) ?? 0n) + 1n;
        const tokenId = (tokenType << 128n) + nextInstance;
        MockOfferContract.owners.set(tokenId, to);
        MockOfferContract.instances.set(tokenType, nextInstance);
        return new MockTransactionRequest({ logs: [{ topics: [TRANSFER_TOPIC], args: [0, 0, tokenId] }] });
    }

    async burn(tokenId: bigint): Promise<Partial<TransactionResponse>> {
        if (MockOfferContract.owners.get(tokenId) !== this.walletAddress) throw new Error("Not owner");
        MockOfferContract.owners.set(tokenId, ZeroAddress);
        MockOfferContract.approvals.set(tokenId, ZeroAddress);
        return new MockTransactionRequest();
    }

    private _getOwned(address: string) {
        return Array.from(MockOfferContract.owners).filter(([_, o]) => o === address);
    }
}
