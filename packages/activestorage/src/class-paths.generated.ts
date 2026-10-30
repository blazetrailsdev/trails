import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attachment.js";
import * as m1 from "./base-job.js";
import * as m2 from "./blob.js";
import * as m3 from "./blob/identifiable.js";
import * as m4 from "./blob/servable.js";
import * as m5 from "./current.js";
import * as m6 from "./downloader.js";
import * as m7 from "./errors.js";
import * as m8 from "./filename.js";
import * as m9 from "./fixture-set.js";
import * as m10 from "./gem-version.js";
import * as m11 from "./log-subscriber.js";
import * as m12 from "./purge-job.js";
import * as m13 from "./record.js";
import * as m14 from "./service.js";
import * as m15 from "./service/configurator.js";
import * as m16 from "./service/disk-service.js";
import * as m17 from "./service/registry.js";

registerClassPaths([
  [() => m0.Attachment, "ActiveStorage::Attachment"],
  [() => m1.BaseJob, "ActiveStorage::BaseJob"],
  [() => m2.Blob, "ActiveStorage::Blob"],
  [() => m3.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m4.Servable, "ActiveStorage::Blob::Servable"],
  [() => m5.Current, "ActiveStorage::Current"],
  [() => m6.Downloader, "ActiveStorage::Downloader"],
  [() => m7.Error, "ActiveStorage::Error"],
  [() => m8.Filename, "ActiveStorage::Filename"],
  [() => m7.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m9.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m7.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m7.InvariableError, "ActiveStorage::InvariableError"],
  [() => m11.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m7.PreviewError, "ActiveStorage::PreviewError"],
  [() => m12.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m13.Record, "ActiveStorage::Record"],
  [() => m14.Service, "ActiveStorage::Service"],
  [() => m15.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m16.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m17.Registry, "ActiveStorage::Service::Registry"],
  [() => m7.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m7.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m10.VERSION, "ActiveStorage::VERSION"],
]);
