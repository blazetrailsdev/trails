import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import {
  computeAssetPath as defaultComputeAssetPath,
  type AssetPathOptions,
} from "@blazetrails/actionview";

/**
 * The Vite build manifest, read as an asset pipeline: it maps the logical name
 * a view asks for onto the digested file `vite build` emitted. Rails has no
 * counterpart, but the seam is Rails' — `AssetUrlHelper#compute_asset_path`
 * (`asset_url_helper.rb:263-268`) is the method "plugins and extensions can
 * override ... to generate digested paths", and Propshaft and Sprockets both
 * take it.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface ViteManifestEntry {
  file: string;
  src?: string;
}

/** Where `vite build` writes its manifest with the generated `vite.config.ts`. */
const VITE_MANIFEST_PATH = "public/assets/.vite/manifest.json";

/**
 * The URL prefix `public/assets` is served under: `publicDir` is mounted at
 * `/`, so everything the build emits lands beneath `/assets`.
 */
const VITE_ASSET_PREFIX = "/assets";

/** @noRailsEquivalent PERMANENT */
export class ViteManifest {
  private readonly entries: Record<string, ViteManifestEntry>;

  constructor(entries: Record<string, ViteManifestEntry> = {}) {
    this.entries = entries;
  }

  /**
   * The digested URL for a logical asset name, or `null` on a miss. Manifest
   * keys are source paths relative to Vite's `root` (`app`), so
   * `application.css` matches `assets/stylesheets/application.css`.
   */
  resolve(logicalPath: string): string | null {
    const entry =
      this.entries[logicalPath] ??
      Object.entries(this.entries).find(
        ([key]) => key === logicalPath || key.endsWith(`/${logicalPath}`),
      )?.[1];
    if (!entry) return null;
    return `${VITE_ASSET_PREFIX}/${entry.file}`;
  }
}

/**
 * Reads the manifest under `root`. A missing manifest is the dev case — no
 * build has run.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function loadViteManifest(root: string): Promise<ViteManifest> {
  const fs = await getFsAsync();
  if (!fs.readFile) throw new Error("fsAdapter.readFile (async) is required");
  let contents: string;
  try {
    contents = await fs.readFile(`${root}/${VITE_MANIFEST_PATH}`, "utf-8");
  } catch {
    return new ViteManifest();
  }
  return new ViteManifest(JSON.parse(contents) as Record<string, ViteManifestEntry>);
}

let currentManifest = new ViteManifest();

/** @noRailsEquivalent PERMANENT */
export function setViteManifest(manifest: ViteManifest): void {
  currentManifest = manifest;
}

/**
 * The `compute_asset_path` override (`asset_url_helper.rb:265-268`), the way
 * `Propshaft::Helper#compute_asset_path` overrides it: hand back the digested
 * path when the build produced one, and otherwise the undigested path Vite's
 * dev server serves from `root: "app"`.
 */
export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  return (
    currentManifest.resolve(source) ??
    `${VITE_ASSET_PREFIX}${defaultComputeAssetPath(source, options)}`
  );
}
