import { getFsAsync } from "@blazetrails/ruby-compat";
import {
  computeAssetPath as defaultComputeAssetPath,
  type AssetPathOptions,
} from "@blazetrails/actionview";

/** @noRailsEquivalent PERMANENT */
export interface ViteManifestEntry {
  file: string;
  src?: string;
}

const VITE_MANIFEST_PATH = "public/assets/.vite/manifest.json";

const VITE_ASSET_PREFIX = "/assets";

/** @noRailsEquivalent PERMANENT */
export class ViteManifest {
  private readonly entries: Record<string, ViteManifestEntry>;

  constructor(entries: Record<string, ViteManifestEntry> = {}) {
    this.entries = entries;
  }

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

/** @noRailsEquivalent PERMANENT */
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

export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  return (
    currentManifest.resolve(source) ??
    `${VITE_ASSET_PREFIX}${defaultComputeAssetPath(source, options)}`
  );
}
