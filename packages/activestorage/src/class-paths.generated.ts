import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./analyze-job.js";
import * as m1 from "./analyzer.js";
import * as m2 from "./analyzer/image-analyzer.js";
import * as m3 from "./analyzer/image-analyzer/image-magick.js";
import * as m4 from "./analyzer/image-analyzer/vips.js";
import * as m5 from "./analyzer/null-analyzer.js";
import * as m6 from "./attached.js";
import * as m7 from "./attached/changes.js";
import * as m8 from "./attached/changes/create-many.js";
import * as m9 from "./attached/changes/create-one-of-many.js";
import * as m10 from "./attached/changes/create-one.js";
import * as m11 from "./attached/changes/delete-many.js";
import * as m12 from "./attached/changes/delete-one.js";
import * as m13 from "./attached/changes/detach-many.js";
import * as m14 from "./attached/changes/detach-one.js";
import * as m15 from "./attached/changes/purge-many.js";
import * as m16 from "./attached/changes/purge-one.js";
import * as m17 from "./attached/many.js";
import * as m18 from "./attached/model.js";
import * as m19 from "./attached/one.js";
import * as m20 from "./attachment.js";
import * as m21 from "./base-job.js";
import * as m22 from "./blob.js";
import * as m23 from "./blob/analyzable.js";
import * as m24 from "./blob/identifiable.js";
import * as m25 from "./blob/servable.js";
import * as m26 from "./current.js";
import * as m27 from "./downloader.js";
import * as m28 from "./errors.js";
import * as m29 from "./filename.js";
import * as m30 from "./fixture-set.js";
import * as m31 from "./gem-version.js";
import * as m32 from "./log-subscriber.js";
import * as m33 from "./mirror-job.js";
import * as m34 from "./named-variant.js";
import * as m35 from "./purge-job.js";
import * as m36 from "./record.js";
import * as m37 from "./reflection.js";
import * as m38 from "./service.js";
import * as m39 from "./service/configurator.js";
import * as m40 from "./service/disk-service.js";
import * as m41 from "./service/mirror-service.js";
import * as m42 from "./service/registry.js";

registerClassPaths([
  [() => m0.AnalyzeJob, "ActiveStorage::AnalyzeJob"],
  [() => m1.Analyzer, "ActiveStorage::Analyzer"],
  [() => m2.ImageAnalyzer, "ActiveStorage::Analyzer::ImageAnalyzer"],
  [() => m3.ImageMagick, "ActiveStorage::Analyzer::ImageAnalyzer::ImageMagick"],
  [() => m4.Vips, "ActiveStorage::Analyzer::ImageAnalyzer::Vips"],
  [() => m5.NullAnalyzer, "ActiveStorage::Analyzer::NullAnalyzer"],
  [() => m6.Attached, "ActiveStorage::Attached"],
  [() => m7.Changes, "ActiveStorage::Attached::Changes"],
  [() => m8.CreateMany, "ActiveStorage::Attached::Changes::CreateMany"],
  [() => m10.CreateOne, "ActiveStorage::Attached::Changes::CreateOne"],
  [() => m9.CreateOneOfMany, "ActiveStorage::Attached::Changes::CreateOneOfMany"],
  [() => m11.DeleteMany, "ActiveStorage::Attached::Changes::DeleteMany"],
  [() => m12.DeleteOne, "ActiveStorage::Attached::Changes::DeleteOne"],
  [() => m13.DetachMany, "ActiveStorage::Attached::Changes::DetachMany"],
  [() => m14.DetachOne, "ActiveStorage::Attached::Changes::DetachOne"],
  [() => m15.PurgeMany, "ActiveStorage::Attached::Changes::PurgeMany"],
  [() => m16.PurgeOne, "ActiveStorage::Attached::Changes::PurgeOne"],
  [() => m17.Many, "ActiveStorage::Attached::Many"],
  [() => m18.Model, "ActiveStorage::Attached::Model"],
  [() => m19.One, "ActiveStorage::Attached::One"],
  [() => m20.Attachment, "ActiveStorage::Attachment"],
  [() => m21.BaseJob, "ActiveStorage::BaseJob"],
  [() => m22.Blob, "ActiveStorage::Blob"],
  [() => m23.Analyzable, "ActiveStorage::Blob::Analyzable"],
  [() => m24.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m25.Servable, "ActiveStorage::Blob::Servable"],
  [() => m26.Current, "ActiveStorage::Current"],
  [() => m27.Downloader, "ActiveStorage::Downloader"],
  [() => m28.Error, "ActiveStorage::Error"],
  [() => m29.Filename, "ActiveStorage::Filename"],
  [() => m28.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m30.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m28.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m28.InvariableError, "ActiveStorage::InvariableError"],
  [() => m32.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m33.MirrorJob, "ActiveStorage::MirrorJob"],
  [() => m34.NamedVariant, "ActiveStorage::NamedVariant"],
  [() => m28.PreviewError, "ActiveStorage::PreviewError"],
  [() => m35.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m36.Record, "ActiveStorage::Record"],
  [() => m37.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m37.ClassMethods, "ActiveStorage::Reflection::ActiveRecordExtensions::ClassMethods"],
  [() => m37.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m37.HasManyAttachedReflection, "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m37.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m37.ReflectionExtension, "ActiveStorage::Reflection::ReflectionExtension"],
  [() => m38.Service, "ActiveStorage::Service"],
  [() => m39.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m40.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m41.MirrorService, "ActiveStorage::Service::MirrorService"],
  [() => m42.Registry, "ActiveStorage::Service::Registry"],
  [() => m28.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m28.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m31.VERSION, "ActiveStorage::VERSION"],
]);
