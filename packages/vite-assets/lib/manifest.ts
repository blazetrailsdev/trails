import { ArgumentError, File, fetch, Mutex } from "@blazetrails/ruby-compat";
import type { Config } from "./config.js";
import { MissingEntrypointError, type LastBuild } from "./missing-entrypoint-error.js";
import type { ViteRuby } from "./vite-ruby.js";

export interface ManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  assets?: string[];
  imports?: ManifestEntry[];
  [key: string]: unknown;
}

export type EntryType = "javascript" | "stylesheet" | "typescript" | "virtual" | string | null;

export interface ManifestBuilder {
  build(): Promise<boolean>;
  lastBuildMetadata(): Promise<LastBuild>;
}

const FS_PREFIX = "/@fs/";

export class Manifest {
  /** @internal */
  private readonly _viteRuby: ViteRuby;
  /** @internal */
  private readonly _buildMutex: Mutex;
  /** @internal */
  private _manifest: Record<string, ManifestEntry> | undefined;

  /** @inventedArm buildMutex — PERMANENT */
  constructor(viteRuby: ViteRuby) {
    this._viteRuby = viteRuby;
    this._buildMutex = new Mutex();
  }

  async pathFor(name: string, options: { type?: EntryType } = {}): Promise<string> {
    return fetch((await this.lookupBang(name, options)) as Record<string, unknown>, "file");
  }

  importChunksFor(
    entry: ManifestEntry,
    { seenFilenames = new Set<string>() }: { seenFilenames?: Set<string> } = {},
  ): ManifestEntry[] {
    const chunks: ManifestEntry[] = [];

    for (const chunk of entry.imports ?? []) {
      const filename = chunk.file;
      if (seenFilenames.has(filename)) continue;
      seenFilenames.add(filename);

      chunks.push(...this.importChunksFor(chunk, { seenFilenames }));
      chunks.push(chunk);
    }

    return chunks;
  }

  async resolveEntries(
    names: string[],
    options: { type?: EntryType } = {},
  ): Promise<{ scripts: string[]; imports: string[]; stylesheets: string[] }> {
    const entries: ManifestEntry[] = [];
    for (const name of names) entries.push(await this.lookupBang(name, options));
    const scriptPaths = entries.map((entry) => fetch<string>(entry, "file"));

    const imports = (await this.isDevServerRunning())
      ? []
      : entries.flatMap((entry) => this.importChunksFor(entry));
    return {
      scripts: scriptPaths,
      imports: [
        ...new Set(
          imports.map((entry) => fetch<string>(entry, "file")).filter((file) => file != null),
        ),
      ],
      stylesheets: (await this.isDevServerRunning())
        ? []
        : [
            ...new Set(
              [...entries, ...imports]
                .flatMap((entry) => entry.css ?? [])
                .filter((css) => css != null),
            ),
          ],
    };
  }

  async refresh(): Promise<Record<string, ManifestEntry>> {
    return (this._manifest = await this.loadManifest());
  }

  async viteClientSrc(): Promise<string | null> {
    return (await this.isDevServerRunning())
      ? await this.prefixAssetWithHost("@vite/client")
      : null;
  }

  async reactRefreshPreamble(): Promise<string | null> {
    if (await this.isDevServerRunning()) {
      return `<script type="module">
  ${await this.reactPreambleCode()}
</script>
`;
    }
    return null;
  }

  async reactPreambleCode(): Promise<string | null> {
    if (await this.isDevServerRunning()) {
      return `import RefreshRuntime from '${await this.prefixAssetWithHost("@react-refresh")}'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
`;
    }
    return null;
  }

  /** @internal */
  protected async lookupBang(
    name: string,
    options: { type?: EntryType } = {},
  ): Promise<ManifestEntry> {
    return (await this.lookup(name, options)) ?? (await this.missingEntryError(name, options));
  }

  /** @internal */
  protected async lookup(
    name: string,
    options: { type?: EntryType } = {},
  ): Promise<ManifestEntry | null> {
    if (await this.isShouldBuild()) {
      if (!(await this._buildMutex.synchronize(() => this.builder().build()))) return null;
    }

    return this.findManifestEntry(await this.resolveEntryName(name, options));
  }

  /** @internal */
  private config(): Promise<Config> {
    return this._viteRuby.config();
  }

  /** @internal */
  private builder(): ManifestBuilder {
    return this._viteRuby.builder();
  }

  /** @internal */
  private isDevServerRunning(): Promise<boolean> {
    return this._viteRuby.isDevServerRunning();
  }

  /** @internal */
  private async isShouldBuild(): Promise<boolean> {
    return (await this.config()).autoBuild && !(await this.isDevServerRunning());
  }

  /** @internal */
  private async findManifestEntry(name: string): Promise<ManifestEntry | null> {
    if (await this.isDevServerRunning()) {
      return { file: await this.prefixViteAsset(name) };
    } else {
      const manifest = await this.manifest();
      return Object.hasOwn(manifest, name) ? manifest[name] : null;
    }
  }

  /** @internal */
  private async manifest(): Promise<Record<string, ManifestEntry>> {
    if ((await this.config()).autoBuild) return this.refresh();

    return (this._manifest ??= await this.loadManifest());
  }

  /** @internal */
  private async loadManifest(): Promise<Record<string, ManifestEntry>> {
    const manifest: Record<string, ManifestEntry> = {};
    for (const path of await (await this.config()).manifestPaths()) {
      Object.assign(manifest, JSON.parse(await path.read()));
    }
    await this.resolveReferences(manifest);
    return manifest;
  }

  /** @internal */
  private async prefixViteAsset(path: string): Promise<string> {
    return File.join(
      (await this.viteAssetOrigin()) ?? "/",
      (await this.config()).publicOutputDir,
      path,
    );
  }

  /** @internal */
  private async prefixAssetWithHost(path: string): Promise<string> {
    const config = await this.config();
    return File.join(
      (await this.viteAssetOrigin()) ?? config.assetHost ?? "/",
      config.publicOutputDir,
      path,
    );
  }

  /** @internal */
  private async viteAssetOrigin(): Promise<string | null> {
    const config = await this.config();
    return (await this.isDevServerRunning()) && config.skipProxy ? config.origin() : null;
  }

  /** @internal */
  private async resolveReferences(manifest: Record<string, ManifestEntry>): Promise<void> {
    for (const entry of Object.values(manifest)) {
      entry.file = await this.prefixViteAsset(entry.file);
      for (const key of ["css", "assets"] as const) {
        const paths = entry[key];
        if (paths) entry[key] = await Promise.all(paths.map((path) => this.prefixViteAsset(path)));
      }
      const imports = entry.imports as unknown as string[] | undefined;
      if (imports) entry.imports = imports.map((name) => fetch<ManifestEntry>(manifest, name));
    }
  }

  /** @internal */
  protected async resolveEntryName(
    name: string,
    { type = null }: { type?: EntryType } = {},
  ): Promise<string> {
    if (type === "virtual") return this.resolveVirtualEntry(name);

    name = this.withFileExtension(String(name), type);
    if (name.startsWith("."))
      throw new ArgumentError(`Asset names can not be relative. Found: ${name}`);

    let match = /^~\/(.+)$/m.exec(name);
    if (match) return match[1];

    match = /^\/(.+)$/m.exec(name);
    if (match) return this.resolveAbsoluteEntry(match[1]);

    return name.includes("/") ? name : File.join((await this.config()).entrypointsDir, name);
  }

  /** @internal */
  private async resolveAbsoluteEntry(name: string): Promise<string> {
    const config = await this.config();
    if (await this.isDevServerRunning()) {
      return File.join(FS_PREFIX, config.root, name);
    } else {
      return config.root.join(name).relativePathFrom(config.viteRootDir()).toString();
    }
  }

  /** @internal */
  private async resolveVirtualEntry(name: string): Promise<string> {
    return Object.keys(await this.manifest()).find((file) => file.includes(name)) ?? name;
  }

  /** @internal */
  private withFileExtension(name: string, entryType: EntryType): string {
    const ext = File.extname(name) === "" ? this.extensionForType(entryType) : null;
    if (ext != null) {
      return `${name}.${ext}`;
    } else {
      return name;
    }
  }

  /** @internal */
  private extensionForType(entryType: EntryType): string | null {
    switch (entryType) {
      case "javascript":
        return "js";
      case "stylesheet":
        return "css";
      case "typescript":
        return "ts";
      default:
        return entryType;
    }
  }

  /** @internal */
  private async missingEntryError(
    name: string,
    options: { type?: EntryType } = {},
  ): Promise<never> {
    const config = await this.config();
    throw new MissingEntrypointError({
      fileName: await this.resolveEntryName(name, options),
      lastBuild: await this.builder().lastBuildMetadata(),
      manifest: this._manifest,
      config,
      manifestPaths: await config.manifestPaths(),
    });
  }
}
