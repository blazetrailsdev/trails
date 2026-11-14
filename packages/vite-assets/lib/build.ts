import { Errno, File, type Pathname } from "@blazetrails/ruby-compat";
import { ViteAssets } from "./vite-assets.js";

export interface BuildAttrs {
  success?: boolean | null;
  timestamp?: string | null;
  viteRuby?: string | null;
  digest?: string | null;
  currentDigest?: string | null;
  lastBuildPath?: Pathname | null;
  errors?: unknown;
}

const MEMBERS: Readonly<Record<string, keyof BuildAttrs>> = Object.freeze({
  success: "success",
  timestamp: "timestamp",
  vite_ruby: "viteRuby",
  digest: "digest",
  current_digest: "currentDigest",
  last_build_path: "lastBuildPath",
  errors: "errors",
});

export class Build {
  success: boolean | null;
  timestamp: string | null;
  viteRuby: string | null;
  digest: string | null;
  currentDigest: string | null;
  lastBuildPath: Pathname | null;
  errors: unknown;

  constructor({
    success = null,
    timestamp = null,
    viteRuby = null,
    digest = null,
    currentDigest = null,
    lastBuildPath = null,
    errors = null,
  }: BuildAttrs = {}) {
    this.success = success;
    this.timestamp = timestamp;
    this.viteRuby = viteRuby;
    this.digest = digest;
    this.currentDigest = currentDigest;
    this.lastBuildPath = lastBuildPath;
    this.errors = errors;
  }

  static async fromPrevious(lastBuildPath: Pathname, currentDigest: string): Promise<Build> {
    return new this({
      ...(await this.parseMetadata(lastBuildPath)),
      currentDigest,
      lastBuildPath,
    });
  }

  /** @internal */
  private static async parseMetadata(pathname: Pathname): Promise<BuildAttrs> {
    try {
      if (!(await File.isExistAsync(pathname.toString()))) return this.defaultMetadata();

      const metadata: BuildAttrs = {};
      for (const [key, value] of Object.entries(JSON.parse(await pathname.read()))) {
        if (Object.hasOwn(MEMBERS, key))
          (metadata as Record<string, unknown>)[MEMBERS[key]] = value;
      }
      return metadata;
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        error instanceof Errno.ENOENT ||
        error instanceof Errno.ENOTDIR
      ) {
        return this.defaultMetadata();
      }
      throw error;
    }
  }

  /** @internal */
  private static defaultMetadata(): BuildAttrs {
    return { timestamp: "never", digest: "none" };
  }

  isStale(): boolean {
    return (
      this.digest !== this.currentDigest ||
      this.isRetryFailed() ||
      this.viteRuby !== ViteAssets.VERSION
    );
  }

  isFresh(): boolean {
    return !this.isStale();
  }

  isRetryFailed(): boolean {
    if (this.success) return false;

    const time = new Date(String(this.timestamp).replace(" ", "T"));
    if (Number.isNaN(time.getTime())) return true;

    return time.getTime() + 3 * 1000 < Date.now();
  }

  withResult(attrs: BuildAttrs): Build {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return new (this.constructor as typeof Build)({
      ...attrs,
      timestamp:
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      viteRuby: ViteAssets.VERSION,
      digest: this.currentDigest,
      currentDigest: this.currentDigest,
      lastBuildPath: this.lastBuildPath,
    });
  }

  async writeToCache(): Promise<void> {
    await this.lastBuildPath!.write(this.toJson());
  }

  toJson(..._args: unknown[]): string {
    return JSON.stringify(
      {
        success: this.success,
        errors: this.errors,
        timestamp: this.timestamp,
        vite_ruby: this.viteRuby,
        digest: this.digest,
      },
      null,
      2,
    );
  }
}
