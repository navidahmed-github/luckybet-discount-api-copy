import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ProviderTokens } from "../src/providerTokens";
import { UserAlreadyExistsError, UserNotFoundError } from "../src/error.types";
import { User } from "../src/entities/user.entity";
import { IUserService } from "../src/modules/user/user.types";
import { UserService } from "../src/modules/user/user.service";
import { WalletService, WalletServiceSettingKeys } from "../src/services/wallet.service";
import { EthereumProviderService } from "../src/services/ethereumProvider.service";
import { MockAtomicSequenceService } from "./mocks/atomicSequence.service";
import { makeMockUserRepository } from "./mocks/respositories";

describe("Users", () => {
    let testModule: TestingModule;
    let userService: IUserService;

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
                    provide: ProviderTokens.WalletService,
                    useClass: WalletService,
                },
                {
                    provide: ProviderTokens.EthereumProviderService,
                    useClass: EthereumProviderService,
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
                    provide: getRepositoryToken(User),
                    useValue: makeMockUserRepository(),
                },
            ],
        }).compile();
        await testModule.init();

        userService = testModule.get<IUserService>(ProviderTokens.UserService);
    });

    afterEach(async () => {
        await testModule?.close();
    });

    it("Should create user and wallet", async () => {
        for (var i = 1; i <= 3; i++)
            await userService.create(`test-user${i}`);

        const users = await userService.getAll();
        expect(users.length).toBe(3);
        expect(users[0].id).toBe("test-user1");
        expect(users[0].address).toBe("0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd");
        expect(users[1].id).toBe("test-user2");
        expect(users[2].id).toBe("test-user3");

        expect(await userService.getById("test-user3")).toEqual(users[2]);
        await expect(userService.getById("test-user4")).rejects.toThrow(UserNotFoundError);

        const wallet = await userService.getUserWallet("test-user1");
        expect(wallet.address).toBe("0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd");
    });

    it("Should not be able to create duplicate users", async () => {
        await userService.create("test-user1");
        await expect(userService.create("test-user1")).rejects.toThrow(UserAlreadyExistsError);
    });
});
