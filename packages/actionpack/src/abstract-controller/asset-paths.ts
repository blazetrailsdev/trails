/**
 * `AbstractController::AssetPaths` — config slots for asset URL
 * generation. Rails uses `config_accessor :asset_host, :assets_dir, …`
 * which creates both class- and instance-level accessors. Trails uses
 * static fields with a `mixin()` applicator: callers pass the host
 * class and the slots are installed with `undefined` defaults so the
 * usual `Cls.assetHost = "…"` assignment Just Works at runtime.
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

/**
 * Install the AssetPaths config slots on `cls` as static properties
 * with `undefined` defaults. Idempotent — re-applying does not clobber
 * a value, and the prototype-chain check (`slot in host` rather than
 * `Object.hasOwn`) preserves inherited values so subclasses don't
 * shadow a parent's configuration with `undefined`.
 */
export function applyAssetPaths(cls: object): void {
  const host = cls as Record<AssetPathSlot, unknown>;
  for (const slot of SLOTS) {
    if (!(slot in host)) host[slot] = undefined;
  }
}
