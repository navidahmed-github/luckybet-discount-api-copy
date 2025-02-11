export interface IJobService {
    define<T>(name: string, process: (data: T, touch: () => Promise<void>) => Promise<void>): Promise<void>;
    run(name: string, data: unknown): Promise<void>;
}
