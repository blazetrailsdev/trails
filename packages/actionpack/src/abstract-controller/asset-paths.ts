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
 * Marks a host class as conforming to the `AssetPathsHost` slot
 * contract. **Does not install anything at runtime** — eager writes of
 * `undefined` would create own properties on subclasses that
 * permanently shadow later assignments on a parent class. JS static
 * inheritance already gives Rails-style propagation: reading an unset
 * slot from a subclass walks to the parent transparently.
 *
 * Kept as a named no-op so call sites mirror Rails'
 * `include AbstractController::AssetPaths` shape and serve as a
 * grep-able marker that the host opts into this slot contract.
 */
export function applyAssetPaths(_cls: object): void {
  // Intentionally empty — see docstring.
}
