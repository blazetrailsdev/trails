import { getApp } from "./config.js";
import { GlobalID, type GlobalIDOptions } from "./global-id.js";
import { SignedGlobalID, type SignedGlobalIDOptions } from "./signed-global-id.js";
import { GID } from "./uri/gid.js";

export interface FixtureSetHost {
  identify(label: string, columnType?: string): number | string;
  defaultFixtureModelName(fixtureSetName: string): string;
}

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

/** @internal */
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

export const FixtureSet = { globalId, signedGlobalId };
