import { IJobService } from "../../src/modules/job/job.types";

export class MockJobService implements IJobService {
    private _jobs = new Map();

    async define<T>(name: string, process: (data: T, touch: () => Promise<void>) => Promise<void>): Promise<void> {
        this._jobs.set(name, process);
    }

    async run(name: string, data: unknown): Promise<void> {
        setTimeout(async () => { await this._jobs.get(name)(data, () => { }) }, 3000);
    }
}
