import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract, Wallet, ZeroAddress } from "ethers";
import { ProviderTokens } from "../src/providerTokens";
import { InsufficientBalanceError, NotApprovedError } from "../src/error.types";
import { Transfer } from "../src/entities/transfer.entity";
import { Template } from "../src/entities/template.entity";
import { OfferImage } from "../src/entities/image.entity";
import { User } from "../src/entities/user.entity";
import { IUserService, UserDTO } from "../src/modules/user/user.types";
import { IOfferService } from "../src/modules/offer/offer.types";
import { UserService } from "../src/modules/user/user.service";
import { OfferService } from "../src/modules/offer/offer.service";
import { IWalletService, WalletService, WalletServiceSettingKeys } from "../src/services/wallet.service";
import { IContractService } from "../src/services/contract.service";
import { MockContractService } from "./mocks/contract.service";
import { MockProviderService } from "./mocks/ethereumProvider.service";
import { MockAtomicSequenceService } from "./mocks/atomicSequence.service";
import { makeMockImageRepository, makeMockTemplateRepository, makeMockTransferRepository, makeMockUserRepository } from "./mocks/respositories";

const TEST_ADDRESS = "0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d";

describe("Offers", () => {
    let testModule: TestingModule;
    let userService: IUserService;
    let contractService: IContractService;
    let offerService: IOfferService;
    let offerContract: Contract;
    let transferRepository: Repository<Transfer>
    let users: UserDTO[];

    function getTokenId(tokenType: number, tokenInstance: number): bigint {
        return (BigInt(tokenType) << 128n) + BigInt(tokenInstance);
    }

    function formatTokenId(tokenId: bigint) {
        return `0x${tokenId.toString(16)}`
    }

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
                    provide: ProviderTokens.OfferService,
                    useClass: OfferService,
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
                    provide: getRepositoryToken(Template),
                    useValue: makeMockTemplateRepository(),
                },
                {
                    provide: getRepositoryToken(OfferImage),
                    useValue: makeMockImageRepository(),
                },
            ],
        }).compile();
        await testModule.init();

        userService = testModule.get<IUserService>(ProviderTokens.UserService);
        contractService = testModule.get<IContractService>(ProviderTokens.ContractService);
        offerService = testModule.get<IOfferService>(ProviderTokens.OfferService);
        offerContract = await contractService.offerContract();
        transferRepository = testModule.get(getRepositoryToken(Transfer));

        jest.spyOn(WalletService.prototype, 'gasWallet').mockResolvedValue();

        (contractService as any).reset();

        const usernames = Array.from({ length: 3 }, (_, i) => `test-user${i + 1}`);
        users = await Promise.all(usernames.map(async u => userService.create(u)));
    });

    afterEach(async () => {
        await testModule?.close();
    });

    it("Should mint offers without tokens", async () => {
        await offerService.create({ address: users[0].address }, 1, 0n);
        await offerService.create({ address: users[1].address }, 3, 0n);
        await offerService.create({ userId: users[0].id }, 1, 0n);
        const rawTransfer = await offerService.create({ address: users[0].address }, 3, 0n);

        const offers = await offerService.getOffers({ userId: users[0].id });
        expect(offers.map(formatTokenId)).toEqual([
            "0x100000000000000000000000000000001",
            "0x100000000000000000000000000000002",
            "0x300000000000000000000000000000002"]);
        expect(transferRepository.save).toHaveBeenCalledTimes(4);
        const expected = { fromAddress: ZeroAddress, toAddress: users[0].address, offer: { tokenId: formatTokenId(getTokenId(3, 2)) } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should mint offer with tokens to a user", async () => {
        await expect(offerService.create({ userId: users[0].id }, 3, 100n, "More details")).rejects.toThrow(InsufficientBalanceError);

        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const adminTokenContract = await contractService.tokenContract(walletService.getAdminWallet());
        await adminTokenContract.mint(users[0].address, 100n);

        const rawTransfer = await offerService.create({ userId: users[0].id }, 3, 100n, "More details");

        expect(transferRepository.save).toHaveBeenCalledTimes(1);
        const expected = {
            fromAddress: ZeroAddress,
            toAddress: users[0].address,
            offer: { tokenId: formatTokenId(getTokenId(3, 1)), additionalInfo: "More details" }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should mint offer with tokens to an address", async () => {
        const wallet = new Wallet(Wallet.createRandom().privateKey);

        await expect(offerService.create({ address: wallet.address }, 3, 100n)).rejects.toThrow(InsufficientBalanceError);

        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const adminWallet = walletService.getAdminWallet();
        const adminTokenContract = await contractService.tokenContract(adminWallet);
        await adminTokenContract.mint(wallet.address, 100n);

        await expect(offerService.create({ address: wallet.address }, 3, 100n)).rejects.toThrow(NotApprovedError);

        const token = await contractService.tokenContract(wallet);
        await token.approve(adminWallet.address, 100n);

        const rawTransfer = await offerService.create({ address: wallet.address }, 3, 100n);

        expect(transferRepository.save).toHaveBeenCalledTimes(1);
        const expected = {
            fromAddress: ZeroAddress,
            toAddress: wallet.address,
            offer: { tokenId: formatTokenId(getTokenId(3, 1)) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    /* !!
        it("Should burn tokens", async () => {
            const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
            const luckyBetAddress = walletService.getLuckyBetWallet().address;
    
            await tokenService.create(luckyBetAddress, 500n);
    
            await expect(tokenService.destroy(600n)).rejects.toThrow(InsufficientBalanceError);
    
            await tokenService.destroy(300n);
            expect((await tokenContract.balanceOf(luckyBetAddress)).toString()).toEqual("200");
            expect(transferRepository.save).toHaveBeenCalledTimes(2);
            expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({
                fromAddress: luckyBetAddress, toAddress: ZeroAddress, token: { amount: "300" }
            }));
        });
    
        it("Should transfer tokens", async () => {
            await tokenService.create(users[0].address, 500n);
    
            await expect(tokenService.transfer(users[0].id, users[1].address, 600n, false)).rejects.toThrow(InsufficientBalanceError);
    
            let rawTransfer = await tokenService.transfer(users[0].id, users[1].address, 400n, false);
            expect((await tokenService.getBalance(users[0].id)).toString()).toEqual("100");
            expect((await tokenService.getBalance(users[1].id)).toString()).toEqual("400");
            let expected = { fromAddress: users[0].address, toAddress: users[1].address, token: { amount: "400" } };
            expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
            expect(rawTransfer).toEqual(expect.objectContaining(expected));
    
            rawTransfer = await tokenService.transfer(users[1].id, TEST_ADDRESS, 100n, false);
            expect((await tokenService.getBalance(users[1].id)).toString()).toEqual("300");
            expect((await tokenContract.balanceOf(TEST_ADDRESS)).toString()).toEqual("100");
            expected = { fromAddress: users[1].address, toAddress: TEST_ADDRESS, token: { amount: "100" } };
            expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
            expect(rawTransfer).toEqual(expect.objectContaining(expected));
    
            rawTransfer = await tokenService.transfer(users[1].id, users[0].address, 140n, true);
            expect((await tokenService.getBalance(users[0].id)).toString()).toEqual("240");
            expect((await tokenService.getBalance(users[1].id)).toString()).toEqual("160");
            expected = { fromAddress: users[1].address, toAddress: users[0].address, token: { amount: "140" } };
            expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
            expect(rawTransfer).toEqual(expect.objectContaining(expected));
        });
        */
});
