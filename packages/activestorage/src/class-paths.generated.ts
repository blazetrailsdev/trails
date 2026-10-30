import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attached.js";
import * as m1 from "./attached/changes.js";
import * as m2 from "./attached/changes/create-one.js";
import * as m3 from "./attached/changes/delete-one.js";
import * as m4 from "./attached/changes/detach-one.js";
import * as m5 from "./attached/changes/purge-one.js";
import * as m6 from "./attached/model.js";
import * as m7 from "./attached/one.js";
import * as m8 from "./attachment.js";
import * as m9 from "./base-job.js";
import * as m10 from "./blob.js";
import * as m11 from "./blob/identifiable.js";
import * as m12 from "./blob/servable.js";
import * as m13 from "./current.js";
import * as m14 from "./downloader.js";
import * as m15 from "./errors.js";
import * as m16 from "./filename.js";
import * as m17 from "./fixture-set.js";
import * as m18 from "./gem-version.js";
import * as m19 from "./log-subscriber.js";
import * as m20 from "./purge-job.js";
import * as m21 from "./record.js";
import * as m22 from "./reflection.js";
import * as m23 from "./service.js";
import * as m24 from "./service/configurator.js";
import * as m25 from "./service/disk-service.js";
import * as m26 from "./service/registry.js";

registerClassPaths([
  [() => m0.Attached, "ActiveStorage::Attached"],
  [() => m1.Changes, "ActiveStorage::Attached::Changes"],
  [() => m2.CreateOne, "ActiveStorage::Attached::Changes::CreateOne"],
  [() => m3.DeleteOne, "ActiveStorage::Attached::Changes::DeleteOne"],
  [() => m4.DetachOne, "ActiveStorage::Attached::Changes::DetachOne"],
  [() => m5.PurgeOne, "ActiveStorage::Attached::Changes::PurgeOne"],
  [() => m6.Model, "ActiveStorage::Attached::Model"],
  [() => m7.One, "ActiveStorage::Attached::One"],
  [() => m8.Attachment, "ActiveStorage::Attachment"],
  [() => m9.BaseJob, "ActiveStorage::BaseJob"],
  [() => m10.Blob, "ActiveStorage::Blob"],
  [() => m11.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m12.Servable, "ActiveStorage::Blob::Servable"],
  [() => m13.Current, "ActiveStorage::Current"],
  [() => m14.Downloader, "ActiveStorage::Downloader"],
  [() => m15.Error, "ActiveStorage::Error"],
  [() => m16.Filename, "ActiveStorage::Filename"],
  [() => m15.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m17.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m15.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m15.InvariableError, "ActiveStorage::InvariableError"],
  [() => m19.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m15.PreviewError, "ActiveStorage::PreviewError"],
  [() => m20.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m21.Record, "ActiveStorage::Record"],
  [() => m22.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m22.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m22.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m23.Service, "ActiveStorage::Service"],
  [() => m24.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m25.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m26.Registry, "ActiveStorage::Service::Registry"],
  [() => m15.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m15.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m18.VERSION, "ActiveStorage::VERSION"],
]);
