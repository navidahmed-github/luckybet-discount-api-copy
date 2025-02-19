import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Wallet } from "ethers";
import { InsufficientBalanceError, StakeNotFoundError } from "../src/error.types";
import { ProviderTokens } from "../src/providerTokens";
import { Stake } from "../src/entities/stake.entity";
import { DeployedContract } from "../src/entities/contract.entity";
import { User } from "../src/entities/user.entity";
import { IUserService } from "../src/modules/user/user.types";
import { IStakeService, StakeType } from "../src/modules/stake/stake.types";
import { UserService } from "../src/modules/user/user.service";
import { StakeService } from "../src/modules/stake/stake.service";
import { IWalletService, WalletService, WalletServiceSettingKeys } from "../src/services/wallet.service";
import { IContractService } from "../src/services/contract.service";
import { MockContractService } from "./mocks/contract.service";
import { MockProviderService } from "./mocks/ethereumProvider.service";
import { MockAtomicSequenceService } from "./mocks/atomicSequence.service";
import { makeMockContractRepository, makeMockStakeRepository, makeMockUserRepository } from "./mocks/respositories";

describe("Staking", () => {
    let testModule: TestingModule;
    let contractService: IContractService;
    let stakeService: IStakeService;

    beforeEach(async () => {
        testModule = await Test.createTestingModule({
            providers: [
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) => {
                            if (key === WalletServiceSettingKeys.WALLET_MNEMONIC) {
                                return "apple horn apple horn apple horn apple horn apple horn apple horn";
                            }
                            if (key === WalletServiceSettingKeys.ADMIN_WALLET_PRIVATE_KEY) {
                                return "0x0123456789012345678901234567890123456789012345678901234567890123";
                            }
                            if (key === WalletServiceSettingKeys.GAS_STATION_WALLET_PRIVATE_KEY) {
                                return "0x0773d4501bda47ef17e1d32b8d66c07a196858b66f739b608bde85e835f3498b";
                            }
                            if (key === WalletServiceSettingKeys.LUCKYBET_WALLET_PRIVATE_KEY) {
                                return "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
                            }
                            if (key === WalletServiceSettingKeys.WALLET_GAS_AMOUNT) {
                                return "0.1";
                            }
                            return key;
                        },
                    },
                },
                {
                    provide: ProviderTokens.ContractService,
                    useClass: MockContractService,
                },
                {
                    provide: ProviderTokens.WalletService,
                    useClass: WalletService,
                },
                {
                    provide: ProviderTokens.EthereumProviderService,
                    useClass: MockProviderService,
                },
                {
                    provide: ProviderTokens.AtomicSequenceService,
                    useClass: MockAtomicSequenceService,
                },
                {
                    provide: ProviderTokens.UserService,
                    useClass: UserService,
                },
                {
                    provide: ProviderTokens.StakeService,
                    useClass: StakeService,
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: makeMockUserRepository(),
                },
                {
                    provide: getRepositoryToken(Stake),
                    useValue: makeMockStakeRepository(),
                },
                {
                    provide: getRepositoryToken(DeployedContract),
                    useValue: makeMockContractRepository(),
                },
            ],
        }).compile();
        await testModule.init();

        contractService = testModule.get<IContractService>(ProviderTokens.ContractService);
        stakeService = testModule.get<IStakeService>(ProviderTokens.StakeService);

        jest.spyOn(WalletService.prototype, 'gasWallet').mockResolvedValue();

        (contractService as any).reset();
    });

    afterEach(async () => {
        await testModule?.close();
    });

    it("Should add staking contracts", async () => {
        const randomAddresses = Array.from({ length: 3 }, _ => Wallet.createRandom().address);

        for (const address of randomAddresses) {
            await stakeService.addContract(address);
        }

        const contracts = await stakeService.getAll();
        expect(contracts.every(c => c.stake.lockTime == 60)).toBeTruthy();
        expect(contracts.every((c, i) => c.stake.rewardPercentage == 1.5 * (i + 1))).toBeTruthy();

        await expect(stakeService.getByAddress(Wallet.createRandom().address)).rejects.toThrow(StakeNotFoundError);

        const find = await stakeService.getByAddress(randomAddresses[1]);
        expect(find.stake.rewardPercentage).toEqual(3);
    });

    it("Should deposit then withdraw stake", async () => {
        const userService = testModule.get<IUserService>(ProviderTokens.UserService);
        const user = await userService.create("test-user");

        const contractAddresses = Array.from({ length: 2 }, _ => Wallet.createRandom().address);
        await Promise.all(contractAddresses.map(async a => stakeService.addContract(a)));

        await expect(stakeService.deposit(contractAddresses[0], user.userId, 500n)).rejects.toThrow(InsufficientBalanceError);

        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const adminTokenContract = await contractService.tokenContract(walletService.getAdminWallet());
        await adminTokenContract.mint(user.address, 1500n);

        let rawStake = await stakeService.deposit(contractAddresses[0], user.userId, 500n)
        expect(rawStake).toEqual(expect.objectContaining({
            contractAddress: contractAddresses[0], stakerAddress: user.address, stakedAmount: "500", deposit: { unlockTime: 1234 }
        }));

        rawStake = await stakeService.deposit(contractAddresses[1], user.userId, 1000n)
        expect(rawStake).toEqual(expect.objectContaining({
            contractAddress: contractAddresses[1], stakerAddress: user.address, stakedAmount: "1000", deposit: { unlockTime: 1234 }
        }));

        let status = await stakeService.getStatus(contractAddresses[0], user.userId);
        expect(status).toEqual(expect.objectContaining({ locked: "200", unlocked: "300", reward: "50" }));
        status = await stakeService.getStatus(contractAddresses[1], user.userId);
        expect(status).toEqual(expect.objectContaining({ locked: "400", unlocked: "600", reward: "100" }));

        rawStake = await stakeService.withdraw(contractAddresses[0], user.userId)
        expect(rawStake).toEqual(expect.objectContaining({
            contractAddress: contractAddresses[0], stakerAddress: user.address, stakedAmount: "300", withdraw: { rewardAmount: "50" }
        }));

        const history = await stakeService.getHistory({ userId: user.userId });
        const expected = [
            { type: StakeType.Deposit, contractAddress: contractAddresses[0], stakedAmount: "500" },
            { type: StakeType.Deposit, contractAddress: contractAddresses[1], stakedAmount: "1000" },
            { type: StakeType.Withdrawal, contractAddress: contractAddresses[0], stakedAmount: "300", rewardAmount: "50" }
        ]
        expect(history.length).toEqual(expected.length);
        for (let i = 0; i < expected.length; i++)
            expect(history[i]).toEqual(expect.objectContaining(expected[i]));
    });
});
