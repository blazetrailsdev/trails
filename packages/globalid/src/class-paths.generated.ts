import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./locator.js";
import * as m1 from "./signed-global-id.js";
import * as m2 from "./uri/gid.js";
import * as m3 from "./verifier.js";

registerClassPaths([
  [() => m0.BaseLocator, "GlobalID::Locator::BaseLocator"],
  [() => m0.BlockLocator, "GlobalID::Locator::BlockLocator"],
  [() => m0.InvalidModelIdError, "GlobalID::Locator::InvalidModelIdError"],
  [() => m0.UnscopedLocator, "GlobalID::Locator::UnscopedLocator"],
  [() => m3.Verifier, "GlobalID::Verifier"],
  [() => m1.ExpiredMessage, "SignedGlobalID::ExpiredMessage"],
  [() => m2.GID, "URI::GID"],
  [() => m2.InvalidModelIdError, "URI::GID::InvalidModelIdError"],
  [() => m2.MissingModelIdError, "URI::GID::MissingModelIdError"],
]);
