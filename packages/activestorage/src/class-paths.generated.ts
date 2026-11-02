import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./analyze-job.js";
import * as m1 from "./analyzer.js";
import * as m2 from "./analyzer/audio-analyzer.js";
import * as m3 from "./analyzer/image-analyzer.js";
import * as m4 from "./analyzer/image-analyzer/image-magick.js";
import * as m5 from "./analyzer/image-analyzer/vips.js";
import * as m6 from "./analyzer/null-analyzer.js";
import * as m7 from "./analyzer/video-analyzer.js";
import * as m8 from "./attached.js";
import * as m9 from "./attached/changes.js";
import * as m10 from "./attached/changes/create-many.js";
import * as m11 from "./attached/changes/create-one-of-many.js";
import * as m12 from "./attached/changes/create-one.js";
import * as m13 from "./attached/changes/delete-many.js";
import * as m14 from "./attached/changes/delete-one.js";
import * as m15 from "./attached/changes/detach-many.js";
import * as m16 from "./attached/changes/detach-one.js";
import * as m17 from "./attached/changes/purge-many.js";
import * as m18 from "./attached/changes/purge-one.js";
import * as m19 from "./attached/many.js";
import * as m20 from "./attached/model.js";
import * as m21 from "./attached/one.js";
import * as m22 from "./attachment.js";
import * as m23 from "./base-job.js";
import * as m24 from "./blob.js";
import * as m25 from "./blob/analyzable.js";
import * as m26 from "./blob/identifiable.js";
import * as m27 from "./blob/servable.js";
import * as m28 from "./current.js";
import * as m29 from "./downloader.js";
import * as m30 from "./errors.js";
import * as m31 from "./filename.js";
import * as m32 from "./fixture-set.js";
import * as m33 from "./gem-version.js";
import * as m34 from "./log-subscriber.js";
import * as m35 from "./mirror-job.js";
import * as m36 from "./named-variant.js";
import * as m37 from "./purge-job.js";
import * as m38 from "./record.js";
import * as m39 from "./reflection.js";
import * as m40 from "./service.js";
import * as m41 from "./service/configurator.js";
import * as m42 from "./service/disk-service.js";
import * as m43 from "./service/mirror-service.js";
import * as m44 from "./service/registry.js";

registerClassPaths([
  [() => m0.AnalyzeJob, "ActiveStorage::AnalyzeJob"],
  [() => m1.Analyzer, "ActiveStorage::Analyzer"],
  [() => m2.AudioAnalyzer, "ActiveStorage::Analyzer::AudioAnalyzer"],
  [() => m3.ImageAnalyzer, "ActiveStorage::Analyzer::ImageAnalyzer"],
  [() => m4.ImageMagick, "ActiveStorage::Analyzer::ImageAnalyzer::ImageMagick"],
  [() => m5.Vips, "ActiveStorage::Analyzer::ImageAnalyzer::Vips"],
  [() => m6.NullAnalyzer, "ActiveStorage::Analyzer::NullAnalyzer"],
  [() => m7.VideoAnalyzer, "ActiveStorage::Analyzer::VideoAnalyzer"],
  [() => m8.Attached, "ActiveStorage::Attached"],
  [() => m9.Changes, "ActiveStorage::Attached::Changes"],
  [() => m10.CreateMany, "ActiveStorage::Attached::Changes::CreateMany"],
  [() => m12.CreateOne, "ActiveStorage::Attached::Changes::CreateOne"],
  [() => m11.CreateOneOfMany, "ActiveStorage::Attached::Changes::CreateOneOfMany"],
  [() => m13.DeleteMany, "ActiveStorage::Attached::Changes::DeleteMany"],
  [() => m14.DeleteOne, "ActiveStorage::Attached::Changes::DeleteOne"],
  [() => m15.DetachMany, "ActiveStorage::Attached::Changes::DetachMany"],
  [() => m16.DetachOne, "ActiveStorage::Attached::Changes::DetachOne"],
  [() => m17.PurgeMany, "ActiveStorage::Attached::Changes::PurgeMany"],
  [() => m18.PurgeOne, "ActiveStorage::Attached::Changes::PurgeOne"],
  [() => m19.Many, "ActiveStorage::Attached::Many"],
  [() => m20.Model, "ActiveStorage::Attached::Model"],
  [() => m21.One, "ActiveStorage::Attached::One"],
  [() => m22.Attachment, "ActiveStorage::Attachment"],
  [() => m23.BaseJob, "ActiveStorage::BaseJob"],
  [() => m24.Blob, "ActiveStorage::Blob"],
  [() => m25.Analyzable, "ActiveStorage::Blob::Analyzable"],
  [() => m26.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m27.Servable, "ActiveStorage::Blob::Servable"],
  [() => m28.Current, "ActiveStorage::Current"],
  [() => m29.Downloader, "ActiveStorage::Downloader"],
  [() => m30.Error, "ActiveStorage::Error"],
  [() => m31.Filename, "ActiveStorage::Filename"],
  [() => m30.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m32.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m30.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m30.InvariableError, "ActiveStorage::InvariableError"],
  [() => m34.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m35.MirrorJob, "ActiveStorage::MirrorJob"],
  [() => m36.NamedVariant, "ActiveStorage::NamedVariant"],
  [() => m30.PreviewError, "ActiveStorage::PreviewError"],
  [() => m37.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m38.Record, "ActiveStorage::Record"],
  [() => m39.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m39.ClassMethods, "ActiveStorage::Reflection::ActiveRecordExtensions::ClassMethods"],
  [() => m39.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m39.HasManyAttachedReflection, "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m39.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m39.ReflectionExtension, "ActiveStorage::Reflection::ReflectionExtension"],
  [() => m40.Service, "ActiveStorage::Service"],
  [() => m41.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m42.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m43.MirrorService, "ActiveStorage::Service::MirrorService"],
  [() => m44.Registry, "ActiveStorage::Service::Registry"],
  [() => m30.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m30.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m33.VERSION, "ActiveStorage::VERSION"],
]);
