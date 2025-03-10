import { IAtomicSequenceService } from "../../src/services/atomicSequence.service";

export class MockAtomicSequenceService implements IAtomicSequenceService {
	private sequences = {};

	async moduleInit(name: string): Promise<void> {
		if (!Object.keys(this.sequences).includes(name)) this.sequences[name] = 1;
	}

	async getNextSequence(name: string): Promise<number> {
		return this.sequences[name]++;
	}
}
