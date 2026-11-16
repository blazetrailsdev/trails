import { extractOptionsBang, htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { extractBang } from "@blazetrails/activesupport/core-ext/hash/slice";
import { ViteAssets, type EntryType, type Manifest } from "@blazetrails/vite-assets";
import { ViteTrails } from "./vite-trails.js";

type Options = Record<string, unknown>;

interface TagHelpersHost {
  request?: { sendEarlyHints?(links: Record<string, string>): unknown } | null;
  javascriptIncludeTag(...sources: unknown[]): SafeBuffer;
  javascriptTag(content: unknown, htmlOptions?: Options): SafeBuffer | Promise<SafeBuffer>;
  stylesheetLinkTag(...sources: unknown[]): SafeBuffer;
  imageTag(source: unknown, options?: Options): SafeBuffer;
  pictureTag(...sources: unknown[]): SafeBuffer;
  pathToAsset(source: unknown, options?: Options): string;
  urlToAsset(source: unknown, options?: Options): string;
  tag(): { link(options: Options): SafeBuffer };
  viteManifest(): Manifest;
  viteAssetPath(name: string, options?: { type?: EntryType }): Promise<string>;
  viteJavascriptTag(...names: unknown[]): Promise<SafeBuffer>;
  vitePreloadTag(...sources: unknown[]): SafeBuffer;
}

export const TagHelpers = {
  async viteClientTag(
    this: TagHelpersHost,
    { crossorigin = "anonymous", ...options }: Options = {},
  ): Promise<SafeBuffer | null> {
    const src = await this.viteManifest().viteClientSrc();
    if (src == null) return null;

    return this.javascriptIncludeTag(src, {
      type: "module",
      extname: false,
      crossorigin,
      ...options,
    });
  },

  async viteReactRefreshTag(
    this: TagHelpersHost,
    options: Options = {},
  ): Promise<SafeBuffer | null> {
    const reactPreambleCode = await this.viteManifest().reactPreambleCode();
    if (reactPreambleCode == null) return null;

    options = { ...options };
    if (!Object.hasOwn(options, "nonce")) options["nonce"] = true;

    return await this.javascriptTag(htmlSafe(reactPreambleCode), { type: "module", ...options });
  },

  async viteAssetPath(
    this: TagHelpersHost,
    name: string,
    options: { type?: EntryType } = {},
  ): Promise<string> {
    return this.pathToAsset(await this.viteManifest().pathFor(name, options));
  },

  async viteAssetUrl(
    this: TagHelpersHost,
    name: string,
    options: { type?: EntryType } = {},
  ): Promise<string> {
    return this.urlToAsset(await this.viteManifest().pathFor(name, options));
  },

  async viteJavascriptTag(this: TagHelpersHost, ...names: unknown[]): Promise<SafeBuffer> {
    const {
      type = "module",
      assetType = "javascript",
      skipPreloadTags = false,
      skipStyleTags = false,
      crossorigin = "",
      media = null,
      ...options
    } = extractOptionsBang(names) as Options;
    const entries = await this.viteManifest().resolveEntries(names as string[], {
      type: assetType as EntryType,
    });
    const tags = this.javascriptIncludeTag(...entries.scripts, {
      crossorigin,
      type,
      extname: false,
      ...options,
    });
    if (!skipPreloadTags)
      tags.concat(this.vitePreloadTag(...entries.imports, { crossorigin, ...options }));

    options["extname"] = false;

    if (!skipStyleTags)
      tags.concat(
        this.stylesheetLinkTag(...entries.stylesheets, { media, crossorigin, ...options }),
      );

    return tags;
  },

  async viteTypescriptTag(this: TagHelpersHost, ...names: unknown[]): Promise<SafeBuffer> {
    const options = extractOptionsBang(names);
    return await this.viteJavascriptTag(...names, { assetType: "typescript", ...options });
  },

  async viteStylesheetTag(this: TagHelpersHost, ...names: unknown[]): Promise<SafeBuffer> {
    const options = { ...extractOptionsBang(names) } as Options;
    const stylePaths: string[] = [];
    for (const name of names)
      stylePaths.push(await this.viteAssetPath(name as string, { type: "stylesheet" }));

    options["extname"] = false;

    return this.stylesheetLinkTag(...stylePaths, options);
  },

  async viteImageTag(
    this: TagHelpersHost,
    name: string,
    options: Options = {},
  ): Promise<SafeBuffer> {
    options = { ...options };
    const srcset = options["srcset"];
    if (srcset != null && srcset !== false && typeof srcset !== "string") {
      const entries: string[] = [];
      for (const [srcName, size] of Array.isArray(srcset)
        ? (srcset as [string, unknown][])
        : Object.entries(srcset as Options))
        entries.push(`${await this.viteAssetPath(srcName)} ${String(size)}`);
      options["srcset"] = entries.join(", ");
    }

    return this.imageTag(await this.viteAssetPath(name), options);
  },

  async vitePictureTag(this: TagHelpersHost, ...sources: unknown[]): Promise<SafeBuffer> {
    const block =
      typeof sources[sources.length - 1] === "function"
        ? (sources.pop() as () => unknown)
        : undefined;
    sources = sources.flat(Infinity);
    const options = extractOptionsBang(sources);

    const viteSources: string[] = [];
    for (const src of sources) viteSources.push(await this.viteAssetPath(src as string));
    return block
      ? this.pictureTag(...viteSources, options, block)
      : this.pictureTag(...viteSources, options);
  },

  /** @internal */
  viteManifest(this: TagHelpersHost): Manifest {
    return ViteAssets.instance().manifest();
  },

  /** @internal */
  vitePreloadTag(this: TagHelpersHost, ...sources: unknown[]): SafeBuffer {
    const { crossorigin, ...options } = extractOptionsBang(sources) as Options;
    const urlOptions = extractBang(options, "host", "protocol");
    const assetPaths = sources.map((source) => this.pathToAsset(source, urlOptions));
    this.request?.sendEarlyHints?.({
      Link: assetPaths
        .map(
          (href) => `<${href}>; rel=modulepreload; as=script; crossorigin=${String(crossorigin)}`,
        )
        .join(","),
    });
    return htmlSafe(
      assetPaths
        .map((href) =>
          String(
            this.tag().link({ rel: "modulepreload", href, as: "script", crossorigin, ...options }),
          ),
        )
        .join("\n"),
    );
  },
};

ViteTrails.TagHelpers = TagHelpers;
