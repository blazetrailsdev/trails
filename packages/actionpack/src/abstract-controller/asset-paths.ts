/**
 * `AbstractController::AssetPaths` — config slot contract for asset
 * URL generation. Rails uses `config_accessor :asset_host, :assets_dir,
 * …` which creates both class- and instance-level accessors.
 *
 * Trails doesn't install anything at runtime: JS static-field
 * inheritance already gives Rails-style propagation (reading an unset
 * slot on a subclass walks to the parent transparently). The slots are
 * exposed as a TypeScript contract via `AssetPathsHost` and an
 * introspection list via `ASSET_PATH_SLOTS`.
 *
 * @internal
 */

const SLOTS = [
  "assetHost",
  "assetsDir",
  "javascriptsDir",
  "stylesheetsDir",
  "defaultAssetHostProtocol",
  "relativeUrlRoot",
] as const;

export type AssetPathSlot = (typeof SLOTS)[number];

/** Reified list of slot names — useful for introspection / api:compare. */
export const ASSET_PATH_SLOTS: readonly AssetPathSlot[] = SLOTS;

export interface AssetPathsHost {
  assetHost?: string;
  assetsDir?: string;
  javascriptsDir?: string;
  stylesheetsDir?: string;
  defaultAssetHostProtocol?: string;
  relativeUrlRoot?: string;
}
