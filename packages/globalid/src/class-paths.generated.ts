import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./fixture-set.js";
import * as m1 from "./identification.js";
import * as m2 from "./locator.js";
import * as m3 from "./signed-global-id.js";
import * as m4 from "./uri/gid.js";
import * as m5 from "./verifier.js";

registerClassPaths([
  [() => m0.FixtureSet, "GlobalID::FixtureSet"],
  [() => m1.Identification, "GlobalID::Identification"],
  [() => m2.Locator, "GlobalID::Locator"],
  [() => m2.BaseLocator, "GlobalID::Locator::BaseLocator"],
  [() => m2.BlockLocator, "GlobalID::Locator::BlockLocator"],
  [() => m2.InvalidModelIdError, "GlobalID::Locator::InvalidModelIdError"],
  [() => m2.UnscopedLocator, "GlobalID::Locator::UnscopedLocator"],
  [() => m5.Verifier, "GlobalID::Verifier"],
  [() => m3.ExpiredMessage, "SignedGlobalID::ExpiredMessage"],
  [() => m4.GID, "URI::GID"],
  [() => m4.InvalidModelIdError, "URI::GID::InvalidModelIdError"],
  [() => m4.MissingModelIdError, "URI::GID::MissingModelIdError"],
]);
