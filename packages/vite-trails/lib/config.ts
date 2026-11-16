import { TopLevel } from "@blazetrails/activesupport";
import { Dir, prepend, rbCallSuper } from "@blazetrails/ruby-compat";
import { Config as ViteAssetsConfig } from "@blazetrails/vite-assets";
import "@blazetrails/trailties";
import { ViteTrails } from "./vite-trails.js";

export const Config = {
  /** @internal */
  configDefaults(this: typeof ViteAssetsConfig): Record<string, unknown> {
    const assetHost = (
      TopLevel.Trails!.application as
        | { config?: { actionController?: { assetHost?: unknown } | null } | null }
        | null
        | undefined
    )?.config?.actionController?.assetHost;
    return rbCallSuper(this, Config.configDefaults, {
      assetHost: typeof assetHost === "function" ? null : assetHost,
      mode: String(TopLevel.Trails!.env),
      root: TopLevel.Trails!.root() || Dir.pwd(),
    }) as Record<string, unknown>;
  },
};

ViteTrails.Config = Config;

prepend({ prototype: ViteAssetsConfig }, Config);
