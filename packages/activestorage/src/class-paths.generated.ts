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
import * as m23 from "./base-controller.js";
import * as m24 from "./base-job.js";
import * as m25 from "./blob.js";
import * as m26 from "./blob/analyzable.js";
import * as m27 from "./blob/identifiable.js";
import * as m28 from "./blob/representable.js";
import * as m29 from "./blob/servable.js";
import * as m30 from "./current.js";
import * as m31 from "./disable-session.js";
import * as m32 from "./downloader.js";
import * as m33 from "./errors.js";
import * as m34 from "./file-server.js";
import * as m35 from "./filename.js";
import * as m36 from "./fixture-set.js";
import * as m37 from "./gem-version.js";
import * as m38 from "./log-subscriber.js";
import * as m39 from "./mirror-job.js";
import * as m40 from "./named-variant.js";
import * as m41 from "./purge-job.js";
import * as m42 from "./record.js";
import * as m43 from "./reflection.js";
import * as m44 from "./service.js";
import * as m45 from "./service/configurator.js";
import * as m46 from "./service/disk-service.js";
import * as m47 from "./service/mirror-service.js";
import * as m48 from "./service/registry.js";
import * as m49 from "./set-blob.js";
import * as m50 from "./set-current.js";
import * as m51 from "./transform-job.js";
import * as m52 from "./variant-with-record.js";
import * as m53 from "./variant.js";
import * as m54 from "./variation.js";

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
  [() => m23.BaseController, "ActiveStorage::BaseController"],
  [() => m24.BaseJob, "ActiveStorage::BaseJob"],
  [() => m25.Blob, "ActiveStorage::Blob"],
  [() => m26.Analyzable, "ActiveStorage::Blob::Analyzable"],
  [() => m27.Identifiable, "ActiveStorage::Blob::Identifiable"],
  [() => m28.Representable, "ActiveStorage::Blob::Representable"],
  [() => m29.Servable, "ActiveStorage::Blob::Servable"],
  [() => m30.Current, "ActiveStorage::Current"],
  [() => m31.DisableSession, "ActiveStorage::DisableSession"],
  [() => m32.Downloader, "ActiveStorage::Downloader"],
  [() => m33.Error, "ActiveStorage::Error"],
  [() => m35.Filename, "ActiveStorage::Filename"],
  [() => m33.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m34.FileServer, "ActiveStorage::FileServer"],
  [() => m36.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m33.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m33.InvariableError, "ActiveStorage::InvariableError"],
  [() => m38.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m39.MirrorJob, "ActiveStorage::MirrorJob"],
  [() => m40.NamedVariant, "ActiveStorage::NamedVariant"],
  [() => m33.PreviewError, "ActiveStorage::PreviewError"],
  [() => m41.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m42.Record, "ActiveStorage::Record"],
  [() => m43.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m43.ClassMethods, "ActiveStorage::Reflection::ActiveRecordExtensions::ClassMethods"],
  [() => m43.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m43.HasManyAttachedReflection, "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m43.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m43.ReflectionExtension, "ActiveStorage::Reflection::ReflectionExtension"],
  [() => m44.Service, "ActiveStorage::Service"],
  [() => m45.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m46.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m47.MirrorService, "ActiveStorage::Service::MirrorService"],
  [() => m48.Registry, "ActiveStorage::Service::Registry"],
  [() => m49.SetBlob, "ActiveStorage::SetBlob"],
  [() => m50.SetCurrent, "ActiveStorage::SetCurrent"],
  [() => m51.TransformJob, "ActiveStorage::TransformJob"],
  [() => m33.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m33.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m53.Variant, "ActiveStorage::Variant"],
  [() => m52.VariantWithRecord, "ActiveStorage::VariantWithRecord"],
  [() => m54.Variation, "ActiveStorage::Variation"],
  [() => m37.VERSION, "ActiveStorage::VERSION"],
]);
