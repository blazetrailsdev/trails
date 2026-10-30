import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attached.js";
import * as m1 from "./attached/changes.js";
import * as m2 from "./attached/changes/create-many.js";
import * as m3 from "./attached/changes/create-one-of-many.js";
import * as m4 from "./attached/changes/create-one.js";
import * as m5 from "./attached/changes/delete-many.js";
import * as m6 from "./attached/changes/delete-one.js";
import * as m7 from "./attached/changes/detach-many.js";
import * as m8 from "./attached/changes/detach-one.js";
import * as m9 from "./attached/changes/purge-many.js";
import * as m10 from "./attached/changes/purge-one.js";
import * as m11 from "./attached/many.js";
import * as m12 from "./attached/model.js";
import * as m13 from "./attached/one.js";
import * as m14 from "./attachment.js";
import * as m15 from "./base-job.js";
import * as m16 from "./blob.js";
import * as m17 from "./blob/identifiable.js";
import * as m18 from "./blob/servable.js";
import * as m19 from "./current.js";
import * as m20 from "./downloader.js";
import * as m21 from "./errors.js";
import * as m22 from "./filename.js";
import * as m23 from "./fixture-set.js";
import * as m24 from "./gem-version.js";
import * as m25 from "./log-subscriber.js";
import * as m26 from "./purge-job.js";
import * as m27 from "./record.js";
import * as m28 from "./reflection.js";
import * as m29 from "./service.js";
import * as m30 from "./service/configurator.js";
import * as m31 from "./service/disk-service.js";
import * as m32 from "./service/registry.js";

registerClassPaths([
  [() => m0.Attached, "ActiveStorage::Attached"],
  [() => m1.Changes, "ActiveStorage::Attached::Changes"],
  [() => m2.CreateMany, "ActiveStorage::Attached::Changes::CreateMany"],
  [() => m4.CreateOne, "ActiveStorage::Attached::Changes::CreateOne"],
  [() => m3.CreateOneOfMany, "ActiveStorage::Attached::Changes::CreateOneOfMany"],
  [() => m5.DeleteMany, "ActiveStorage::Attached::Changes::DeleteMany"],
  [() => m6.DeleteOne, "ActiveStorage::Attached::Changes::DeleteOne"],
  [() => m7.DetachMany, "ActiveStorage::Attached::Changes::DetachMany"],
  [() => m8.DetachOne, "ActiveStorage::Attached::Changes::DetachOne"],
  [() => m9.PurgeMany, "ActiveStorage::Attached::Changes::PurgeMany"],
  [() => m10.PurgeOne, "ActiveStorage::Attached::Changes::PurgeOne"],
  [() => m11.Many, "ActiveStorage::Attached::Many"],
  [() => m12.Model, "ActiveStorage::Attached::Model"],
  [() => m13.One, "ActiveStorage::Attached::One"],
  [() => m14.Attachment, "ActiveStorage::Attachment"],
  [() => m15.BaseJob, "ActiveStorage::BaseJob"],
  [() => m16.Blob, "ActiveStorage::Blob"],
  [() => m17.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m18.Servable, "ActiveStorage::Blob::Servable"],
  [() => m19.Current, "ActiveStorage::Current"],
  [() => m20.Downloader, "ActiveStorage::Downloader"],
  [() => m21.Error, "ActiveStorage::Error"],
  [() => m22.Filename, "ActiveStorage::Filename"],
  [() => m21.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m23.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m21.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m21.InvariableError, "ActiveStorage::InvariableError"],
  [() => m25.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m21.PreviewError, "ActiveStorage::PreviewError"],
  [() => m26.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m27.Record, "ActiveStorage::Record"],
  [() => m28.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m28.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m28.HasManyAttachedReflection, "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m28.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m29.Service, "ActiveStorage::Service"],
  [() => m30.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m31.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m32.Registry, "ActiveStorage::Service::Registry"],
  [() => m21.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m21.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m24.VERSION, "ActiveStorage::VERSION"],
]);
