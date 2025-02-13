import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract, ZeroAddress } from "ethers";
import { ProviderTokens } from "../src/providerTokens";
import { InsufficientBalanceError } from "../src/error.types";
import { Transfer } from "../src/entities/transfer.entity";
import { AirdropChunk } from "../src/entities/airdrop.entity";
import { User } from "../src/entities/user.entity";
import { ITokenService } from "../src/modules/tokens/token.types";
import { IUserService, UserDTO } from "../src/modules/user/user.types";
import { UserService } from "../src/modules/user/user.service";
import { TokenService } from "../src/modules/tokens/token.service";
import { IWalletService, WalletService, WalletServiceSettingKeys } from "../src/services/wallet.service";
import { IContractService } from "../src/services/contract.service";
import { MockContractService } from "./mocks/contract.service";
import { MockProviderService } from "./mocks/ethereumProvider.service";
import { MockAtomicSequenceService } from "./mocks/atomicSequence.service";
import { MockJobService } from "./mocks/job.service";
import { makeMockAirdropRepository, makeMockTransferRepository, makeMockUserRepository } from "./mocks/respositories";

const TEST_ADDRESS = "0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d";

describe("Tokens", () => {
    let testModule: TestingModule;
    let userService: IUserService;
    let contractService: IContractService;
    let tokenService: ITokenService;
    let tokenContract: Contract;
    let transferRepository: Repository<Transfer>
    let users: UserDTO[];

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
                    provide: ProviderTokens.JobService,
                    useClass: MockJobService,
                },
                {
                    provide: ProviderTokens.UserService,
                    useClass: UserService,
                },
                {
                    provide: ProviderTokens.TokenService,
                    useClass: TokenService,
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: makeMockUserRepository(),
                },
                {
                    provide: getRepositoryToken(Transfer),
                    useValue: makeMockTransferRepository(),
                },
                {
                    provide: getRepositoryToken(AirdropChunk),
                    useValue: makeMockAirdropRepository(),
                },
            ],
        }).compile();
        await testModule.init();

        userService = testModule.get<IUserService>(ProviderTokens.UserService);
        contractService = testModule.get<IContractService>(ProviderTokens.ContractService);
        tokenService = testModule.get<ITokenService>(ProviderTokens.TokenService);
        tokenContract = await contractService.tokenContract();
        transferRepository = testModule.get(getRepositoryToken(Transfer));

        jest.spyOn(WalletService.prototype, 'gasWallet').mockResolvedValue();

        (contractService as any).reset();

        const usernames = Array.from({ length: 3 }, (_, i) => `test-user${i + 1}`);
        users = await Promise.all(usernames.map(async u => userService.create(u)));
    });

    afterEach(async () => {
        await testModule?.close();
    });

    it("Should mint tokens", async () => {
        await tokenService.create({ address: users[0].address }, 500n);
        await tokenService.create({ address: users[1].address }, 300n);
        const rawTransfer = await tokenService.create({ address: users[0].address }, 400n);

        const balances = await Promise.all(users.map(async u => tokenService.getBalance({ userId: u.id })));
        expect(balances.map(b => b.toString())).toEqual(["900", "300", "0"]);
        expect(transferRepository.save).toHaveBeenCalledTimes(3);
        const expected = { fromAddress: ZeroAddress, toAddress: users[0].address, token: { amount: "400" } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should burn tokens", async () => {
        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const luckyBetAddress = walletService.getLuckyBetWallet().address;

        await tokenService.create({ address: luckyBetAddress }, 500n);

        await expect(tokenService.destroy(600n)).rejects.toThrow(InsufficientBalanceError);

        await tokenService.destroy(300n);
        expect((await tokenContract.balanceOf(luckyBetAddress)).toString()).toEqual("200");
        expect(transferRepository.save).toHaveBeenCalledTimes(2);
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({
            fromAddress: luckyBetAddress, toAddress: ZeroAddress, token: { amount: "300" }
        }));
    });

    it("Should transfer tokens", async () => {
        await tokenService.create({ address: users[0].address }, 500n);

        await expect(tokenService.transfer({ userId: users[0].id }, { address: users[1].address }, 600n)).rejects.toThrow(InsufficientBalanceError);

        let rawTransfer = await tokenService.transfer({ userId: users[0].id }, { address: users[1].address }, 400n);
        expect((await tokenService.getBalance({ userId: users[0].id })).toString()).toEqual("100");
        expect((await tokenService.getBalance({ userId: users[1].id })).toString()).toEqual("400");
        let expected = { fromAddress: users[0].address, toAddress: users[1].address, token: { amount: "400" } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));

        rawTransfer = await tokenService.transfer({ userId: users[1].id }, { address: TEST_ADDRESS }, 100n);
        expect((await tokenService.getBalance({ address: users[1].address })).toString()).toEqual("300");
        expect((await tokenContract.balanceOf(TEST_ADDRESS)).toString()).toEqual("100");
        expected = { fromAddress: users[1].address, toAddress: TEST_ADDRESS, token: { amount: "100" } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));

        rawTransfer = await tokenService.transfer({ userId: users[1].id, asAdmin: true }, { userId: users[0].id }, 140n);
        expect((await tokenService.getBalance({ userId: users[0].id })).toString()).toEqual("240");
        expect((await tokenService.getBalance({ userId: users[1].id })).toString()).toEqual("160");
        expected = { fromAddress: users[1].address, toAddress: users[0].address, token: { amount: "140" } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });
});
