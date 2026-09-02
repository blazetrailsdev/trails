/**
 * Trailtie — the Vite asset pipeline's `compute_asset_path` override.
 *
 * Rails ships no asset pipeline itself: `AssetUrlHelper#compute_asset_path`
 * (`actionview/lib/action_view/helpers/asset_url_helper.rb:262-268`) returns
 * the undigested public path and documents itself as the hook a pipeline gem
 * (sprockets-rails, propshaft) overrides to "generate digested paths". trails'
 * pipeline is Vite, whose build writes `public/assets/.vite/manifest.json`
 * mapping each logical entry to its hashed output, so this is that override.
 */
import { ASSET_PUBLIC_DIRECTORIES, Base, type AssetPathOptions } from "@blazetrails/actionview";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

interface ManifestEntry {
  file: string;
}

let manifest: Record<string, ManifestEntry> | null = null;

/**
 * Reads the Vite manifest under `root` if a build has produced one. A missing
 * manifest is not an error — the dev server serves the source file from
 * `root: "app"`, so the undigested path is the correct answer there.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function loadManifest(root: string): Promise<void> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const file = path.join(root, "public/assets/.vite/manifest.json");
  if (!(await fs.exists(file))) {
    manifest = null;
    return;
  }
  manifest = JSON.parse(await fs.readFile!(file, "utf-8")) as Record<string, ManifestEntry>;
}

/**
 * Drops the loaded manifest, so lookups fall back to the dev path again.
 *
 * @noRailsEquivalent PERMANENT
 */
export function resetManifest(): void {
  manifest = null;
}

/**
 * The digested `compute_asset_path`. `source` arrives as the logical name the
 * layout wrote (`application.css`); the manifest is keyed by the entry's path
 * relative to the Vite root, which is the same public directory
 * (`ASSET_PUBLIC_DIRECTORIES`, `asset_url_helper.rb:255-262`) the undigested
 * path uses under `assets/`.
 */
export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  const dir = (options.type != null ? ASSET_PUBLIC_DIRECTORIES[options.type] : null) || "";
  const logicalPath = `assets${dir}/${source}`;
  const entry = manifest?.[logicalPath];
  if (entry) return `/assets/${entry.file}`;
  return `/${logicalPath}`;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.initializer("trails.assets.vite_manifest", async (app: unknown) => {
      await loadManifest(await (app as { root(): Promise<string> }).root());
      (Base.prototype as unknown as Record<string, unknown>)["computeAssetPath"] = computeAssetPath;
    });
  }
}
