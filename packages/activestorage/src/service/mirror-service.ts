import { delegate } from "@blazetrails/activesupport";
import { ThreadPoolExecutor } from "@blazetrails/ruby-compat";
import { MirrorJob } from "../mirror-job.js";
import { Service } from "../service.js";
import type { Configurator } from "./configurator.js";

export class MirrorService extends Service {
  readonly primary: Service;
  readonly mirrors: Service[];
  private executor: ThreadPoolExecutor;
  declare pathFor: (key: string) => string;

  /** @internal */
  static override build({
    primary,
    mirrors,
    name,
    configurator,
  }: {
    primary: string;
    mirrors: string[];
    name: string;
    configurator: Configurator;
    [k: string]: unknown;
  }): Service {
    const serviceInstance = new this({
      primary: configurator.build(primary),
      mirrors: mirrors.map((mirrorName) => configurator.build(mirrorName)),
    });
    serviceInstance.name = name;
    return serviceInstance;
  }

  /** @missingRailsArgs new — PERMANENT */
  constructor({ primary, mirrors }: { primary: Service; mirrors: Service[] }) {
    super();
    this.primary = primary;
    this.mirrors = mirrors;
    this.executor = new ThreadPoolExecutor({
      minThreads: 1,
      maxThreads: mirrors.length,
      maxQueue: 0,
      fallbackPolicy: "caller_runs",
      idletime: 60,
    });
  }

  override async upload(
    key: string,
    io: { rewind(): unknown },
    { checksum = null, ...options }: { checksum?: string | null; [k: string]: unknown } = {},
  ): Promise<void> {
    io.rewind();
    await this.primary.upload(key, io, { checksum: checksum, ...options });
    await this.mirrorLater(key, { checksum: checksum });
  }

  override async delete(key: string): Promise<void> {
    await this.performAcrossServices("delete", key);
  }

  override async deletePrefixed(prefix: string): Promise<void> {
    await this.performAcrossServices("deletePrefixed", prefix);
  }

  /** @internal */
  async mirrorLater(key: string, { checksum }: { checksum: string | null }): Promise<void> {
    await MirrorJob.performLater(key, { checksum: checksum });
  }

  async mirror(key: string, { checksum }: { checksum: string | null }): Promise<void> {
    await this.instrument("mirror", { key: key, checksum: checksum }, async () => {
      const mirrorsInNeedOfMirroring: Service[] = [];
      for (const service of this.mirrors) {
        if (!(await service.isExist(key))) mirrorsInNeedOfMirroring.push(service);
      }
      if (mirrorsInNeedOfMirroring.length > 0) {
        await this.primary.open(key, { checksum: checksum }, async (io) => {
          for (const service of mirrorsInNeedOfMirroring) {
            await io.rewind();
            await service.upload(key, io, { checksum: checksum });
          }
        });
      }
    });
  }

  /** @internal */
  private eachService(): Service[] {
    return [this.primary, ...this.mirrors];
  }

  /** @internal */
  private async performAcrossServices(
    method: "delete" | "deletePrefixed",
    ...args: [string]
  ): Promise<void> {
    const tasks = this.eachService().map(
      (service) =>
        new Promise<void>((resolve, reject) => {
          this.executor.post(() => service[method](...args).then(resolve, reject));
        }),
    );
    await Promise.all(tasks);
  }
}

delegate.call(
  MirrorService.prototype,
  "download",
  "downloadChunk",
  "isExist",
  "url",
  "urlForDirectUpload",
  "headersForDirectUpload",
  "pathFor",
  "compose",
  { to: "primary" },
);
