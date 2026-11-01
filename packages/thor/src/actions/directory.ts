import { Dir, File, Hash, rbObjIsKindOf, rtest, sort, toS } from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { TEMPLATE_EXTNAME } from "../base.js";
import { escapeGlobs } from "../util.js";
import { EmptyDirectory } from "./empty-directory.js";

type Block = (content: string) => unknown;
type DirectoryBase = ActionsHost & {
  emptyDirectory(destination: string, config?: Record<string, unknown>): unknown;
  template(source: string, ...args: unknown[]): Promise<unknown>;
  copyFile(source: string, ...args: unknown[]): Promise<unknown>;
};

export function directory(this: ActionsHost, source: string, ...args: unknown[]): unknown {
  const block = (typeof (args.at(-1) ?? null) === "function" ? args.pop() : undefined) as
    | Block
    | undefined;
  const config = (rbObjIsKindOf(args.at(-1) ?? null, Hash) ? args.pop() : {}) as Record<
    string,
    unknown
  >;
  const destination = (args[0] as string | undefined) ?? source;
  return this.action(
    new Directory(this as DirectoryBase, source, destination ?? source, config, block),
  );
}

export class Directory extends EmptyDirectory {
  source: Promise<string>;
  /** @internal */
  private _block: Block | undefined;

  constructor(
    base: DirectoryBase,
    source: string,
    destination: string | null = null,
    config: Record<string, unknown> = {},
    block?: Block,
  ) {
    const resolved = (async () =>
      File.expandPath(
        (await Dir.globAsync(escapeGlobs(await base.findInSourcePaths(toS(source)))))[0] ?? null!,
      ))();
    resolved.catch(() => {});
    super(base, destination, { recursive: true, ...config });
    this.source = resolved;
    this._block = block;
  }

  override async invokeBang(): Promise<unknown> {
    await this.source;
    await (this.base as DirectoryBase).emptyDirectory(this.givenDestination, this.config);
    return this.executeBang();
  }

  override async revokeBang(): Promise<unknown> {
    return this.executeBang();
  }

  /**
   * @internal
   * @missingRailsCall directory? — CONVERGEABLE call-gate-credits-is-directory-async
   * @inventedArm if — PERMANENT
   */
  protected async executeBang(): Promise<unknown> {
    const source = await this.source;
    let lookup = escapeGlobs(source);
    lookup = rtest(this.config["recursive"]) ? File.join(lookup, "**") : lookup;
    lookup = this.fileLevelLookup(lookup);

    const files = sort(await this.files(lookup));
    for (const fileSource of files) {
      if (await File.isDirectoryAsync(fileSource)) continue;
      const excludePattern = this.config["excludePattern"] as RegExp | null | undefined;
      if (rtest(excludePattern) && fileSource.match(excludePattern)) continue;
      const compiled = /^(.*\.tt)\.(js|js\.map|d\.ts)$/.exec(fileSource);
      if (compiled && files.includes(compiled[1])) continue;
      let fileDestination = File.join(this.givenDestination, fileSource.replaceAll(source, "."));
      fileDestination = fileDestination.replaceAll("/./", "/");

      if (/\.empty_directory$/.test(fileSource)) {
        const dirname = File.dirname(fileDestination).replace(/\/\.$/, "");
        if (dirname === this.givenDestination) continue;
        await (this.base as DirectoryBase).emptyDirectory(dirname, this.config);
      } else if (RegExp(`${TEMPLATE_EXTNAME}$`).test(fileSource)) {
        await (this.base as DirectoryBase).template(
          fileSource,
          fileDestination.slice(0, -3),
          this.config,
          ...(this._block ? [this._block] : []),
        );
      } else {
        await (this.base as DirectoryBase).copyFile(
          fileSource,
          fileDestination,
          this.config,
          ...(this._block ? [this._block] : []),
        );
      }
    }
    return files;
  }

  /** @internal */
  protected fileLevelLookup(previousLookup: string): string {
    return File.join(previousLookup, "*");
  }

  /** @internal */
  protected files(lookup: string): Promise<string[]> {
    return Dir.globAsync(lookup, File.FNM_DOTMATCH);
  }
}
