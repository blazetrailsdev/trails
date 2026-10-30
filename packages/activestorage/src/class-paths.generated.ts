import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./base-job.js";
import * as m1 from "./blob.js";
import * as m2 from "./blob/identifiable.js";
import * as m3 from "./blob/servable.js";
import * as m4 from "./current.js";
import * as m5 from "./downloader.js";
import * as m6 from "./errors.js";
import * as m7 from "./filename.js";
import * as m8 from "./gem-version.js";
import * as m9 from "./log-subscriber.js";
import * as m10 from "./purge-job.js";
import * as m11 from "./record.js";
import * as m12 from "./service.js";
import * as m13 from "./service/configurator.js";
import * as m14 from "./service/disk-service.js";
import * as m15 from "./service/registry.js";

registerClassPaths([
  [() => m0.BaseJob, "ActiveStorage::BaseJob"],
  [() => m1.Blob, "ActiveStorage::Blob"],
  [() => m2.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m3.Servable, "ActiveStorage::Blob::Servable"],
  [() => m4.Current, "ActiveStorage::Current"],
  [() => m5.Downloader, "ActiveStorage::Downloader"],
  [() => m6.Error, "ActiveStorage::Error"],
  [() => m7.Filename, "ActiveStorage::Filename"],
  [() => m6.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m6.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m6.InvariableError, "ActiveStorage::InvariableError"],
  [() => m9.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m6.PreviewError, "ActiveStorage::PreviewError"],
  [() => m10.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m11.Record, "ActiveStorage::Record"],
  [() => m12.Service, "ActiveStorage::Service"],
  [() => m13.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m14.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m15.Registry, "ActiveStorage::Service::Registry"],
  [() => m6.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m6.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m8.VERSION, "ActiveStorage::VERSION"],
]);
