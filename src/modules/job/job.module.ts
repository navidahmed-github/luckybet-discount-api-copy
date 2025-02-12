import { Module } from "@nestjs/common";
import { ProviderTokens } from "../../providerTokens";
import { JobService } from "./job.service";

@Module({
    exports: [ProviderTokens.JobService],
    providers: [
        {
            provide: ProviderTokens.JobService,
            useClass: JobService,
        },
    ]
})

export class JobModule {}
