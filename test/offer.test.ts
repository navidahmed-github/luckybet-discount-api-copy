import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract, Wallet, ZeroAddress } from "ethers";
import { ProviderTokens } from "../src/providerTokens";
import { formatTokenId, getTokenId, MimeType, splitTokenId } from "../src/common.types";
import { InsufficientBalanceError, NotApprovedError } from "../src/error.types";
import { Transfer } from "../src/entities/transfer.entity";
import { Template } from "../src/entities/template.entity";
import { OfferImage } from "../src/entities/image.entity";
import { User } from "../src/entities/user.entity";
import { IUserService } from "../src/modules/user/user.types";
import { IOfferService } from "../src/modules/offer/offer.types";
import { UserService } from "../src/modules/user/user.service";
import { OfferService, OfferServiceSettingKeys } from "../src/modules/offer/offer.service";
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
    let users: User[];

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
                            if (key === OfferServiceSettingKeys.ATTRIBUTE_OTHER_MAPPING) {
                                return "type";
                            }
                            return undefined;
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
        await offerService.create({ userId: users[0].userId }, 1, 0n);
        const rawTransfer = await offerService.create({ address: users[0].address }, 3, 0n);

        const offers = await offerService.getOffers({ userId: users[0].userId });
        expect(offers.map(o => o.tokenId)).toEqual([
            "0x0000000000000000000000000000000100000000000000000000000000000001",
            "0x0000000000000000000000000000000100000000000000000000000000000002",
            "0x0000000000000000000000000000000300000000000000000000000000000002"]);
        expect(await offerContract.ownerOf(getTokenId(1, 1))).toEqual(users[0].address);
        expect(await offerContract.ownerOf(getTokenId(1, 2))).toEqual(users[0].address);
        expect(await offerContract.ownerOf(getTokenId(3, 1))).toEqual(users[1].address);
        expect(await offerContract.ownerOf(getTokenId(3, 2))).toEqual(users[0].address);
        expect(transferRepository.save).toHaveBeenCalledTimes(4);
        const expected: any = { fromAddress: ZeroAddress, toAddress: users[0].address, offer: { offerType: 3, offerInstance: 2 } };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(getTokenId(3, 2), true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should mint offer with tokens to a user", async () => {
        await expect(offerService.create({ userId: users[0].userId }, 3, 100n, "More details")).rejects.toThrow(InsufficientBalanceError);
        const tokenId = getTokenId(3, 1);

        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const adminTokenContract = await contractService.tokenContract(walletService.getAdminWallet());
        await adminTokenContract.mint(users[0].address, 100n);

        const rawTransfer = await offerService.create({ userId: users[0].userId }, 3, 100n, "More details");
        expect(await offerContract.ownerOf(tokenId)).toEqual(users[0].address);
        expect(transferRepository.save).toHaveBeenCalledTimes(1);
        const expected: any = {
            fromAddress: ZeroAddress,
            toAddress: users[0].address,
            offer: { ...splitTokenId(tokenId), additionalInfo: "More details" }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = "0x300000000000000000000000000000001";
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should mint offer with tokens to an address", async () => {
        const wallet = new Wallet(Wallet.createRandom().privateKey);

        await expect(offerService.create({ address: wallet.address }, 3, 100n)).rejects.toThrow(InsufficientBalanceError);
        const tokenId = getTokenId(3, 1);

        const walletService = testModule.get<IWalletService>(ProviderTokens.WalletService);
        const adminWallet = walletService.getAdminWallet();
        const adminTokenContract = await contractService.tokenContract(adminWallet);
        await adminTokenContract.mint(wallet.address, 100n);

        await expect(offerService.create({ address: wallet.address }, 3, 100n)).rejects.toThrow(NotApprovedError);

        const token = await contractService.tokenContract(wallet);
        await token.approve(adminWallet.address, 100n);
        const rawTransfer = await offerService.create({ address: wallet.address }, 3, 100n);
        expect(await offerContract.ownerOf(tokenId)).toEqual(wallet.address);
        expect(transferRepository.save).toHaveBeenCalledTimes(1);
        const expected: any = {
            fromAddress: ZeroAddress,
            toAddress: wallet.address,
            offer: { ...splitTokenId(tokenId) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(tokenId, true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should active offer", async () => {
        await offerService.create({ address: users[0].address }, 3, 0n);
        const tokenId = getTokenId(3, 1);
        expect(await offerContract.ownerOf(tokenId)).toEqual(users[0].address);

        await expect(offerService.activate(users[1].userId, tokenId)).rejects.toThrow(InsufficientBalanceError);

        const rawTransfer = await offerService.activate(users[0].userId, tokenId);
        expect(await offerContract.ownerOf(tokenId)).toEqual(ZeroAddress);
        expect(transferRepository.save).toHaveBeenCalledTimes(2);
        const expected: any = {
            fromAddress: users[0].address,
            toAddress: ZeroAddress,
            offer: { ...splitTokenId(tokenId) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(tokenId, true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should transfer offers", async () => {
        await offerService.create({ address: users[0].address }, 3, 0n);
        const tokenId = getTokenId(3, 1);

        await expect(offerService.transfer({ userId: users[2].userId }, { address: users[1].address }, tokenId))
            .rejects.toThrow(InsufficientBalanceError);

        let rawTransfer = await offerService.transfer({ userId: users[0].userId }, { address: users[1].address }, tokenId);
        expect((await offerService.getOffers({ userId: users[0].userId })).length).toEqual(0);
        expect((await offerService.getOffers({ userId: users[1].userId }))[0].tokenId)
            .toEqual("0x0000000000000000000000000000000300000000000000000000000000000001");
        let expected: any = {
            fromAddress: users[0].address,
            toAddress: users[1].address,
            offer: { ...splitTokenId(tokenId) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(tokenId, true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));

        rawTransfer = await offerService.transfer({ userId: users[1].userId, asAdmin: true }, { userId: users[2].userId }, tokenId);
        expect((await offerService.getOffers({ userId: users[1].userId })).length).toEqual(0);
        expect((await offerService.getOffers({ userId: users[2].userId }))[0].tokenId)
            .toEqual("0x0000000000000000000000000000000300000000000000000000000000000001");
        expected = {
            fromAddress: users[1].address,
            toAddress: users[2].address,
            offer: { ...splitTokenId(tokenId) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(tokenId, true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));

        rawTransfer = await offerService.transfer({ userId: users[2].userId }, { address: TEST_ADDRESS }, tokenId);
        expect((await offerService.getOffers({ userId: users[1].userId })).length).toEqual(0);
        expect(await offerContract.ownerOf(tokenId)).toEqual(TEST_ADDRESS);
        expected = {
            fromAddress: users[2].address,
            toAddress: TEST_ADDRESS,
            offer: { ...splitTokenId(tokenId) }
        };
        expect(transferRepository.save).toHaveBeenLastCalledWith(expect.objectContaining(expected));
        expected.offer.tokenId = formatTokenId(tokenId, true);
        expect(rawTransfer).toEqual(expect.objectContaining(expected));
    });

    it("Should manage offer template", async () => {
        const offer = {
            name: "10% Discount",
            description: "10% of your next bet on the horses",
            attributes: [{ name: "discount_percent", value: 10, other: "number" }, { name: "valid", value: "horses" }]
        };
        const enhancedOffer = {
            name: "10% Discount (Enhanced)",
            description: "10% of your next bet on any event",
            attributes: [{ name: "discount_percent", value: 10 }, { name: "valid", value: "all" }]
        }
        await offerService.createTemplate(3, offer);
        await offerService.createTemplate(3, enhancedOffer, 4);
        expect(await offerService.getMetadata(1, 1)).toBeUndefined();
        // 'other' field in attributes should be renamed to 'type' 
        const transformOffer = {
            ...offer,
            attributes: offer.attributes.map(a => ({ name: a.name, value: a.value, ...(a.other && { type: a.other }) }))
        };
        expect(await offerService.getMetadata(3, 1, true)).toStrictEqual({ ...transformOffer, usesDefault: true });
        expect(await offerService.getMetadata(3, 4, true)).toStrictEqual({ ...enhancedOffer, usesDefault: false });

        await offerService.deleteTemplate(3, 4);
        expect(await offerService.getMetadata(3, 4, true)).toStrictEqual({ ...transformOffer, usesDefault: true });

        await offerService.deleteTemplate(3);
        expect(await offerService.getMetadata(3, 1, true)).toBeUndefined();
    });

    it("Should manage offer images", async () => {
        await offerService.uploadImage(3, MimeType.JPG, Buffer.from([5, 6, 7, 8]));
        await offerService.uploadImage(3, MimeType.GIF, Buffer.from([1, 2, 3, 4]), 4);
        expect(await offerService.getImage(1, 1)).toBeUndefined();
        let image = await offerService.getImage(3, 1);
        expect(image.format).toEqual(MimeType.JPG);
        expect(image.data.toString('hex')).toEqual("05060708");
        image = await offerService.getImage(3, 4);
        expect(image.format).toEqual(MimeType.GIF);
        expect(image.data.toString('hex')).toEqual("01020304");

        await offerService.deleteImage(3, 4);
        image = await offerService.getImage(3, 4);
        expect(image.format).toEqual(MimeType.JPG);
        expect(image.data.toString('hex')).toEqual("05060708");

        await offerService.deleteImage(3);
        expect(await offerService.getImage(3, 1)).toBeUndefined();
    });
});
