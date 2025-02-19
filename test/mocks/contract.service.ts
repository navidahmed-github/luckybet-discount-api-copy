import { Contract, keccak256, Log, TransactionReceipt, TransactionResponse, Wallet, ZeroAddress } from "ethers";
import { IContractService } from "../../src/services/contract.service";
import { TRANSFER_TOPIC } from "../../src/modules/offer/offer.service";
import { DEPOSIT_TOPIC, WITHDRAW_TOPIC } from "../../src/modules/stake/stake.service";

export class MockContractService implements IContractService {
    public reset() {
        MockTokenContract.reset();
        MockStakeContract.reset();
        MockOfferContract.reset();
    }

    public async tokenContract(wallet?: Wallet): Promise<Contract> {
        return new MockTokenContract(wallet) as any;
    }

    public async stakeContract(address: string, wallet?: Wallet): Promise<Contract> {
        return new MockStakeContract(address, wallet) as any;
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

abstract class MockBaseContract {
    protected walletAddress: string;
    protected isAdmin: boolean;

    constructor(wallet?: Wallet) {
        this.walletAddress = wallet?.address ?? ZeroAddress;
        this.isAdmin = wallet?.address === "0x14791697260E4c9A71f18484C9f997B308e59325";
    }
}

export class MockTokenContract extends MockBaseContract {
    private static balances: Map<string, bigint>;
    private static approvals: Map<string, [string, bigint]>;

    constructor(wallet?: Wallet) {
        super(wallet);
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

    async mintMany(tos: string[], amount: bigint): Promise<Partial<TransactionResponse>> {
        if (!this.isAdmin) throw new Error("Requires administrator rights");
        tos.forEach(to => this._updateBalance(to, amount));
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

export class MockStakeContract extends MockBaseContract {
    private static deployed: string[];
    private static stakes: Map<string, Map<string, bigint>>;
    private static closed: boolean;
    contractAddress: string;

    constructor(address: string, wallet?: Wallet) {
        super(wallet);
        if (!MockStakeContract.deployed.includes(address)) {
            MockStakeContract.deployed.push(address);
            MockStakeContract.stakes.set(address, new Map<string, bigint>());
        }
        this.contractAddress = address;
    }

    static reset() {
        MockStakeContract.deployed = [];
        MockStakeContract.stakes = new Map<string, Map<string, bigint>>();
        MockStakeContract.closed = false;
    }

    async supportsInterface(interfaceId: string): Promise<boolean> {
        return interfaceId == "0x2919aabb";
    }

    async rewardPercentage(): Promise<bigint> {
        return 150n * BigInt(MockStakeContract.deployed.findIndex(a => a == this.contractAddress) + 1);
    }

    async lockTime(): Promise<bigint> {
        return 60n;
    }

    async close(): Promise<void> {
        if (!this.isAdmin) throw new Error("Requires administrator rights");
        MockStakeContract.closed = true;
    }

    async isClosed(): Promise<boolean> {
        return MockStakeContract.closed;
    }

    async lockedAmount(staker: string): Promise<bigint> {
        return (MockStakeContract.stakes.get(this.contractAddress).get(staker) ?? 0n) * 2n / 5n;
    }

    async unlockedAmount(staker: string): Promise<bigint> {
        return (MockStakeContract.stakes.get(this.contractAddress).get(staker) ?? 0n) * 3n / 5n;
    }

    async rewardAmount(staker: string): Promise<bigint> {
        return (MockStakeContract.stakes.get(this.contractAddress).get(staker) ?? 0n) / 10n;
    }

    async stake(amount: bigint): Promise<Partial<TransactionResponse>> {
        const token = new MockTokenContract({ address: this.contractAddress } as Wallet);
        token.transferFrom(this.walletAddress, this.contractAddress, amount);
        const contractStakes = MockStakeContract.stakes.get(this.contractAddress);
        contractStakes.set(this.walletAddress, (contractStakes.get(this.walletAddress) ?? 0n) + amount);
        return new MockTransactionRequest({ logs: [{ topics: [DEPOSIT_TOPIC], args: [this.walletAddress, 0n, 1234n, amount] }] });
    }

    async withdraw(): Promise<Partial<TransactionResponse>> {
        const contractStakes = MockStakeContract.stakes.get(this.contractAddress);
        const staked = contractStakes.get(this.walletAddress) ?? 0n;
        contractStakes.set(this.walletAddress, staked * 2n / 5n);
        return new MockTransactionRequest({ logs: [{ topics: [WITHDRAW_TOPIC], args: [this.walletAddress, staked * 3n / 5n, staked / 10n] }] });
    }
}

export class MockOfferContract extends MockBaseContract {
    private static owners: Map<bigint, string>;
    private static approvals: Map<bigint, string>;
    private static instances: Map<bigint, bigint>;

    constructor(wallet?: Wallet) {
        super(wallet);
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

    async ownerOf(tokenId: bigint): Promise<string> {
        return MockOfferContract.owners.get(tokenId) ?? ZeroAddress;
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
