import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./errors.js";
import * as m1 from "./gem-version.js";
import * as m2 from "./log-subscriber.js";

registerClassPaths([
  [() => m0.Error, "ActiveStorage::Error"],
  [() => m0.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m0.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m0.InvariableError, "ActiveStorage::InvariableError"],
  [() => m2.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m0.PreviewError, "ActiveStorage::PreviewError"],
  [() => m0.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m0.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m1.VERSION, "ActiveStorage::VERSION"],
]);
