import { getApp } from "./config.js";
import { GlobalID, type GlobalIDOptions } from "./global-id.js";
import { SignedGlobalID, type SignedGlobalIDOptions } from "./signed-global-id.js";
import { GID } from "./uri/gid.js";

/** The `ActiveRecord::FixtureSet` class methods `create_global_id` calls on
 * `self` — `identify` (`fixtures.rb:619`) and `default_fixture_model_name`
 * (`fixtures.rb:544`). */
export interface FixtureSetHost {
  identify(label: string, columnType?: string): number | string;
  defaultFixtureModelName(fixtureSetName: string): string;
}

/** Mirrors `GlobalID::FixtureSet#global_id` (`fixture_set.rb:5-7`). */
export function globalId(
  this: FixtureSetHost,
  fixtureSetName: string,
  label: string,
  { columnType = ":integer", ...options }: GlobalIDOptions & { columnType?: string } = {},
): GlobalID {
  return createGlobalId.call(this, fixtureSetName, label, {
    columnType,
    klass: GlobalID,
    ...options,
  });
}

/** Mirrors `GlobalID::FixtureSet#signed_global_id` (`fixture_set.rb:9-11`). */
export function signedGlobalId(
  this: FixtureSetHost,
  fixtureSetName: string,
  label: string,
  { columnType = ":integer", ...options }: SignedGlobalIDOptions & { columnType?: string } = {},
): SignedGlobalID {
  return createGlobalId.call(this, fixtureSetName, label, {
    columnType,
    klass: SignedGlobalID,
    ...options,
  }) as SignedGlobalID;
}

/**
 * Mirrors the private `create_global_id` (`fixture_set.rb:14-19`).
 *
 * @internal
 */
function createGlobalId(
  this: FixtureSetHost,
  fixtureSetName: string,
  label: string,
  {
    klass,
    columnType = ":integer",
    ...options
  }: SignedGlobalIDOptions & {
    klass: typeof GlobalID | typeof SignedGlobalID;
    columnType?: string;
  },
): GlobalID {
  const identifier = this.identify(label, columnType);
  const modelName = this.defaultFixtureModelName(fixtureSetName);
  const uri = GID.build({ app: getApp() as string, modelName, modelId: identifier, params: {} });
  return new klass(uri, options);
}

/**
 * Port of `GlobalID::FixtureSet` (`global_id/fixture_set.rb`) — the module
 * `railtie.rb:42` mixes into `ActiveRecord::FixtureSet` with
 * `send :extend, GlobalID::FixtureSet`.
 */
export const FixtureSet = { globalId, signedGlobalId };
