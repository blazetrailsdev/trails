/** @internal */

const SLOTS = [
  "assetHost",
  "assetsDir",
  "javascriptsDir",
  "stylesheetsDir",
  "defaultAssetHostProtocol",
  "relativeUrlRoot",
] as const;

export type AssetPathSlot = (typeof SLOTS)[number];

export const ASSET_PATH_SLOTS: readonly AssetPathSlot[] = SLOTS;

export interface AssetPathsHost {
  assetHost?: string;
  assetsDir?: string;
  javascriptsDir?: string;
  stylesheetsDir?: string;
  defaultAssetHostProtocol?: string;
  relativeUrlRoot?: string;
}
