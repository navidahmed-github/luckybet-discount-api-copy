import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Agenda } from "@hokify/agenda";
import { IJobService } from "./job.types";

@Injectable()
export class JobService implements IJobService, OnApplicationBootstrap, OnModuleInit, OnModuleDestroy {
    private readonly _logger = new Logger(JobService.name);
    private _agenda: Agenda;

    constructor() { }

    async onModuleInit() {
        this._agenda = new Agenda({
            db: { address: process.env.MONGO_CONNECTION_STRING, collection: "jobs" },
            maxConcurrency: 1, // only allow one job to run at any one time, this avoids conflicts with the admin wallet
            defaultConcurrency: 1,
            lockLimit: 1,
            defaultLockLimit: 1
        });
    }

    // wait for every module to finished initialization before starting agenda
    async onApplicationBootstrap() {
        await this._agenda.start();
        this._agenda.on("error", err => { this._logger.error(err); });
    }

    async onModuleDestroy() {
        await this._agenda.stop();
    }

    async define<T>(name: string, process: (data: T, touch: () => Promise<void>) => Promise<void>) {
        this._agenda.define(name, async job => {
            const { name, _id } = job.attrs;
            const touch = async () => { await job.touch(); }
            try {
                this._logger.verbose(`Job starting ${name}: ${_id}`);
                await process(job.attrs.data, touch);
                this._logger.verbose(`Job finished ${name}: ${_id} `);
            } catch (err) {
                this._logger.error(`Job failed ${name}: ${_id}`, err)
            }
        });
    }

    async run(name: string, data: unknown): Promise<void> {
        const job = await this._agenda.now(name, data);
        this._logger.verbose(`Job scheduled ${job.attrs.name}: ${job.attrs._id} `);
    }
}
