import { onLoad } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { loadViteManifest, setViteManifest, computeAssetPath } from "./vite-manifest.js";

interface ViteAssetsHost {
  resolvedRoot(): Promise<string>;
}

interface ActionViewBaseLike {
  prototype: Record<string, unknown>;
}

/** @noRailsEquivalent PERMANENT */
export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.initializer("vite.helpers", () => {
      onLoad("action_view", (base: ActionViewBaseLike) => {
        base.prototype["computeAssetPath"] = computeAssetPath;
      });
    });

    this.initializer("vite.manifest", async (app) => {
      setViteManifest(await loadViteManifest(await (app as ViteAssetsHost).resolvedRoot()));
    });
  }
}
