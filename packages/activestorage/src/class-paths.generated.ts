import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./base-job.js";
import * as m1 from "./current.js";
import * as m2 from "./errors.js";
import * as m3 from "./filename.js";
import * as m4 from "./gem-version.js";
import * as m5 from "./log-subscriber.js";
import * as m6 from "./record.js";
import * as m7 from "./service.js";
import * as m8 from "./service/configurator.js";
import * as m9 from "./service/registry.js";

registerClassPaths([
  [() => m0.BaseJob, "ActiveStorage::BaseJob"],
  [() => m1.Current, "ActiveStorage::Current"],
  [() => m2.Error, "ActiveStorage::Error"],
  [() => m3.Filename, "ActiveStorage::Filename"],
  [() => m2.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m2.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m2.InvariableError, "ActiveStorage::InvariableError"],
  [() => m5.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m2.PreviewError, "ActiveStorage::PreviewError"],
  [() => m6.Record, "ActiveStorage::Record"],
  [() => m7.Service, "ActiveStorage::Service"],
  [() => m8.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m9.Registry, "ActiveStorage::Service::Registry"],
  [() => m2.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m2.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m4.VERSION, "ActiveStorage::VERSION"],
]);
