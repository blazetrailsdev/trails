import { ArgumentError, exec, File } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";
import { Vite } from "./vite.js";

export class SSR extends Vite {
  static override readonly DEFAULT_ENV = Vite.CURRENT_ENV || "production";
  static readonly JS_EXTENSIONS = ["js", "mjs", "cjs"];

  static {
    this.desc("Run the resulting app from building in SSR mode.");
    this.executableOptions();
  }

  override async call({
    mode,
    inspect = false,
    traceDeprecation = false,
  }: {
    mode: string;
    inspect?: boolean | null;
    traceDeprecation?: boolean | null;
  }): Promise<never> {
    ViteAssets.env()["VITE_RUBY_MODE"] = mode;

    const config = ViteAssets.config();
    let ssrEntrypoint: string | undefined;
    for (const ext of SSR.JS_EXTENSIONS) {
      const path = config.ssrOutputDir.join(`ssr.${ext}`).toString();
      if (await File.isExistAsync(path)) {
        ssrEntrypoint = path;
        break;
      }
    }

    if (!ssrEntrypoint) {
      throw new ArgumentError(
        `No ssr entrypoint found \`${config.ssrOutputDir.relativePathFrom(config.root)}/ssr.{${SSR.JS_EXTENSIONS.join(",")}}\`. Have you run bin/vite build --ssr?`,
      );
    }

    const cmd = [
      "node",
      inspect ? "--inspect-brk" : null,
      traceDeprecation ? "--trace-deprecation" : null,
      ssrEntrypoint,
    ];
    return exec(...(cmd.filter((x) => x != null) as [string, ...string[]]));
  }
}
