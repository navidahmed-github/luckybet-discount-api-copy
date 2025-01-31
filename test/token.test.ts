import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ProviderTokens } from "../src/providerTokens";
import { Transfer } from "../src/entities/transfer.entity";
import { User } from "../src/entities/user.entity";
import { UserService } from "../src/modules/user/user.service";
import { TokenService } from "../src/modules/tokens/token.service";
import { WalletService, WalletServiceSettingKeys } from "../src/services/wallet.service";
import { MockContractService } from "./mocks/contract.service";
import { MockProviderService } from "./mocks/ethereumProvider.service";
import { MockAtomicSequenceService } from "./mocks/atomicSequence.service";
import { makeMockTransferRepository, makeMockUserRepository } from "./mocks/respositories";
import { ZeroAddress } from "ethers";

let testModule: TestingModule;

describe("Tokens", () => {
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
            ],
        }).compile();
        await testModule.init();
    });

    afterEach(async () => {
        await testModule?.close();
    });

    it("Should mint tokens", async () => {
        const userService = testModule.get<UserService>(ProviderTokens.UserService);
        const tokenService = testModule.get<TokenService>(ProviderTokens.TokenService);
        const transferRepository = testModule.get(getRepositoryToken(Transfer));

        const usernames = Array.from({ length: 3 }, (_, i) => `test-user${i}`);
        const users = await Promise.all(usernames.map(async u => userService.create(u)));

        await tokenService.mint(users[0].address, 500n);
        await tokenService.mint(users[1].address, 300n);
        await tokenService.mint(users[0].address, 400n);

        const balances = await Promise.all(usernames.map(async u => tokenService.getBalance(u)));
        expect(balances.map(b => b.toString())).toEqual(["900", "300", "0"]);
        expect(transferRepository.save).toHaveBeenCalledTimes(3);
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(
            { fromAddress: ZeroAddress, toAddress: users[0].address, token: { amount: 400n } }
        ));
    });
});
