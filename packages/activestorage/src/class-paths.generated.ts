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
import * as m25 from "./blob/representable.js";
import * as m26 from "./blob/servable.js";
import * as m27 from "./current.js";
import * as m28 from "./downloader.js";
import * as m29 from "./errors.js";
import * as m30 from "./filename.js";
import * as m31 from "./fixture-set.js";
import * as m32 from "./gem-version.js";
import * as m33 from "./log-subscriber.js";
import * as m34 from "./mirror-job.js";
import * as m35 from "./named-variant.js";
import * as m36 from "./purge-job.js";
import * as m37 from "./record.js";
import * as m38 from "./reflection.js";
import * as m39 from "./service.js";
import * as m40 from "./service/configurator.js";
import * as m41 from "./service/disk-service.js";
import * as m42 from "./service/mirror-service.js";
import * as m43 from "./service/registry.js";
import * as m44 from "./transform-job.js";
import * as m45 from "./variant-with-record.js";
import * as m46 from "./variant.js";
import * as m47 from "./variation.js";

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
  [() => m25.Representable, "ActiveStorage::Blob::Representable"],
  [() => m26.Servable, "ActiveStorage::Blob::Servable"],
  [() => m27.Current, "ActiveStorage::Current"],
  [() => m28.Downloader, "ActiveStorage::Downloader"],
  [() => m29.Error, "ActiveStorage::Error"],
  [() => m30.Filename, "ActiveStorage::Filename"],
  [() => m29.FileNotFoundError, "ActiveStorage::FileNotFoundError"],
  [() => m31.FixtureSet, "ActiveStorage::FixtureSet"],
  [() => m29.IntegrityError, "ActiveStorage::IntegrityError"],
  [() => m29.InvariableError, "ActiveStorage::InvariableError"],
  [() => m33.LogSubscriber, "ActiveStorage::LogSubscriber"],
  [() => m34.MirrorJob, "ActiveStorage::MirrorJob"],
  [() => m35.NamedVariant, "ActiveStorage::NamedVariant"],
  [() => m29.PreviewError, "ActiveStorage::PreviewError"],
  [() => m36.PurgeJob, "ActiveStorage::PurgeJob"],
  [() => m37.Record, "ActiveStorage::Record"],
  [() => m38.ActiveRecordExtensions, "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m38.ClassMethods, "ActiveStorage::Reflection::ActiveRecordExtensions::ClassMethods"],
  [() => m38.HasAttachedReflection, "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m38.HasManyAttachedReflection, "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m38.HasOneAttachedReflection, "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m38.ReflectionExtension, "ActiveStorage::Reflection::ReflectionExtension"],
  [() => m39.Service, "ActiveStorage::Service"],
  [() => m40.Configurator, "ActiveStorage::Service::Configurator"],
  [() => m41.DiskService, "ActiveStorage::Service::DiskService"],
  [() => m42.MirrorService, "ActiveStorage::Service::MirrorService"],
  [() => m43.Registry, "ActiveStorage::Service::Registry"],
  [() => m44.TransformJob, "ActiveStorage::TransformJob"],
  [() => m29.UnpreviewableError, "ActiveStorage::UnpreviewableError"],
  [() => m29.UnrepresentableError, "ActiveStorage::UnrepresentableError"],
  [() => m46.Variant, "ActiveStorage::Variant"],
  [() => m45.VariantWithRecord, "ActiveStorage::VariantWithRecord"],
  [() => m47.Variation, "ActiveStorage::Variation"],
  [() => m32.VERSION, "ActiveStorage::VERSION"],
]);
