import {
  Digest,
  Dir,
  File,
  FileUtils,
  getFs,
  type FsStatResult,
  type Pathname,
  type Process,
} from "@blazetrails/ruby-compat";
import { Build, type BuildAttrs } from "./build.js";
import type { Config } from "./config.js";
import type { ViteAssets } from "./vite-assets.js";

type Signature = [mtime: number, size: number];

export class Builder {
  /** @internal */
  private readonly _viteRuby: ViteAssets;
  /** @internal */
  private _fileDigests: Record<string, [Signature, string]> = Object.create(null);
  /** @internal */
  private _lastDigest: string | undefined;
  /** @internal */
  private _lastDigestAt: number | undefined;

  constructor(viteRuby: ViteAssets) {
    this._viteRuby = viteRuby;
  }

  async build(...args: string[]): Promise<boolean> {
    const lastBuild = await this.lastBuildMetadata({ ssr: args.includes("--ssr") });

    const force = args.includes("--force");
    args = args.filter((arg) => arg !== "--force");
    if (
      force ||
      lastBuild.isStale() ||
      (await (await this.config()).manifestPaths()).length === 0
    ) {
      const [stdout, stderr, status] = await this.buildWithVite(...args);
      await this.logBuildResult(stdout, stderr, status);
      await this.recordBuildMetadata(lastBuild, { errors: stderr, success: status.isSuccess() });
      return status.isSuccess()!;
    } else if (lastBuild.success) {
      this.logger.debug(
        `Skipping vite build. Watched files have not changed since the last build at ${lastBuild.timestamp}`,
      );
      return true;
    } else {
      this.logger.error(
        `Skipping vite build. Watched files have not changed since the build failed at ${lastBuild.timestamp} ❌`,
      );
      return false;
    }
  }

  async lastBuildMetadata({ ssr = false }: { ssr?: boolean } = {}): Promise<Build> {
    return Build.fromPrevious(await this.lastBuildPath({ ssr }), await this.watchedFilesDigest());
  }

  /** @internal */
  private config(): Promise<Config> {
    return this._viteRuby.config();
  }

  /** @internal */
  private get logger() {
    return this._viteRuby.logger;
  }

  /** @internal */
  private run(argv: string[]) {
    return this._viteRuby.run(argv);
  }

  /** @internal */
  private async recordBuildMetadata(build: Build, attrs: BuildAttrs): Promise<void> {
    await FileUtils.mkpathAsync((await this.config()).buildCacheDir.toString());
    await build.withResult(attrs).writeToCache();
  }

  /** @internal */
  private async lastBuildPath({ ssr }: { ssr: boolean }): Promise<Pathname> {
    const config = await this.config();
    return config.buildCacheDir.join(`last${ssr ? "-ssr" : ""}-build-${config.mode}.json`);
  }

  /**
   * @internal
   * @missingRailsCall within_root — PERMANENT
   */
  async watchedFilesDigest(): Promise<string> {
    if (this._lastDigestAt !== undefined && Date.now() - this._lastDigestAt < 1000) {
      return this._lastDigest!;
    }

    const config = await this.config();
    const root = File.expandPath(config.root.toString());
    const previousDigests = this._fileDigests;
    this._fileDigests = Object.create(null);
    const files: string[] = [];
    for (const pattern of config.watchedPaths()) {
      files.push(...(await Dir.globAsync(pattern, 0, { base: root })));
    }
    const fileIds: string[] = [];
    for (const file of files.sort()) {
      const id = await this.fileDigest(file, previousDigests, root);
      if (id != null) fileIds.push(id);
    }
    this._lastDigestAt = Date.now();
    return (this._lastDigest = Digest.SHA1.hexdigest(fileIds.join("/")));
  }

  /** @internal */
  private async fileDigest(
    file: string,
    previousDigests: Record<string, [Signature, string]>,
    root: string,
  ): Promise<string | null> {
    const path = File.join(root, file);
    const stat = await getFs().stat!(path);
    if (stat.isDirectory()) return null;

    const signature: Signature = [stat.mtime.getTime(), stat.size];
    const [previousSignature, previousId] = previousDigests[file] ?? [];
    const id =
      previousSignature?.[0] === signature[0] &&
      previousSignature[1] === signature[1] &&
      !this.isRecentlyModified(stat)
        ? previousId
        : `${File.basename(file)}/${(await Digest.SHA1.file(path)).hexdigest()}`;
    this._fileDigests[file] = [signature, id];
    return id;
  }

  /** @internal */
  private isRecentlyModified(stat: FsStatResult): boolean {
    return Date.now() - stat.mtime.getTime() < 1000;
  }

  /** @internal */
  private async buildWithVite(
    ...args: string[]
  ): Promise<[string, string, InstanceType<typeof Process.Status>]> {
    this.logger.info("Building with Vite ⚡️");

    return (await this.run(["build", ...args])) as [
      string,
      string,
      InstanceType<typeof Process.Status>,
    ];
  }

  /** @internal */
  private async logBuildResult(
    _stdout: string,
    stderr: string,
    status: InstanceType<typeof Process.Status>,
  ): Promise<void> {
    if (status.isSuccess()) {
      this.logger.info(`Build with Vite complete: ${(await this.config()).buildOutputDir()}`);
      if (stderr !== "") this.logger.error(stderr);
    } else {
      this.logger.error(stderr);
      this.logger.error(status);
      this.logger.error("Build with Vite failed! ❌");
      if (stderr.includes("ERR! canceled")) {
        this.logger.error(
          "❌ Check that vite and vite-plugin-ruby are in devDependencies and have been installed. ",
        );
      }
    }
  }
}
