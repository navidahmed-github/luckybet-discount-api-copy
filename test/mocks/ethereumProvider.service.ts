import { JsonRpcProvider } from "ethers";
import { IProviderService } from "../../src/services/ethereumProvider.service";

function mockJsonRpcProvider(): jest.Mocked<JsonRpcProvider> {
    return {
        blockNumber: 300,
        getBlockNumber: jest.fn(async function () {
            return this.blockNumber++;
        }),
        getBlock: jest.fn(async function (blockNumber: number) {
            return { blockNumber, timestamp: 1000 * blockNumber };
        }),
        getBalance: jest.fn(async function (_address: string) {
            return 1n;
        })
    } as any;
}

export class MockProviderService implements IProviderService {
    public provider;

    constructor() {
        this.provider = mockJsonRpcProvider();
    }

    getProvider() {
        return this.provider;
    }

    getDeployment() {
        return null;
    }
}
