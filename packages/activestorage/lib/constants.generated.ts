import { defineConstants } from "@blazetrails/ruby-compat/classpath";
import * as m0 from "./analyzer.js";
import * as m1 from "./analyzer/audio-analyzer.js";
import * as m2 from "./analyzer/image-analyzer.js";
import * as m3 from "./analyzer/image-analyzer/image-magick.js";
import * as m4 from "./analyzer/image-analyzer/vips.js";
import * as m5 from "./analyzer/null-analyzer.js";
import * as m6 from "./analyzer/video-analyzer.js";
import * as m7 from "./app/controllers/active-storage/base-controller.js";
import * as m8 from "./app/controllers/active-storage/blobs/proxy-controller.js";
import * as m9 from "./app/controllers/active-storage/blobs/redirect-controller.js";
import * as m10 from "./app/controllers/active-storage/direct-uploads-controller.js";
import * as m11 from "./app/controllers/active-storage/disk-controller.js";
import * as m12 from "./app/controllers/active-storage/representations/base-controller.js";
import * as m13 from "./app/controllers/active-storage/representations/proxy-controller.js";
import * as m14 from "./app/controllers/active-storage/representations/redirect-controller.js";
import * as m15 from "./app/controllers/concerns/active-storage/disable-session.js";
import * as m16 from "./app/controllers/concerns/active-storage/file-server.js";
import * as m17 from "./app/controllers/concerns/active-storage/set-blob.js";
import * as m18 from "./app/controllers/concerns/active-storage/set-current.js";
import * as m19 from "./app/controllers/concerns/active-storage/streaming.js";
import * as m20 from "./app/jobs/active-storage/analyze-job.js";
import * as m21 from "./app/jobs/active-storage/base-job.js";
import * as m22 from "./app/jobs/active-storage/mirror-job.js";
import * as m23 from "./app/jobs/active-storage/preview-image-job.js";
import * as m24 from "./app/jobs/active-storage/purge-job.js";
import * as m25 from "./app/jobs/active-storage/transform-job.js";
import * as m26 from "./app/models/active-storage/attachment.js";
import * as m27 from "./app/models/active-storage/blob/servable.js";
import * as m28 from "./app/models/active-storage/current.js";
import * as m29 from "./app/models/active-storage/filename.js";
import * as m30 from "./app/models/active-storage/named-variant.js";
import * as m31 from "./app/models/active-storage/preview.js";
import * as m32 from "./app/models/active-storage/record.js";
import * as m33 from "./app/models/active-storage/variant-with-record.js";
import * as m34 from "./app/models/active-storage/variant.js";
import * as m35 from "./app/models/active-storage/variation.js";
import * as m36 from "./attached.js";
import * as m37 from "./attached/changes.js";
import * as m38 from "./attached/changes/create-many.js";
import * as m39 from "./attached/changes/create-one-of-many.js";
import * as m40 from "./attached/changes/create-one.js";
import * as m41 from "./attached/changes/delete-many.js";
import * as m42 from "./attached/changes/delete-one.js";
import * as m43 from "./attached/changes/detach-many.js";
import * as m44 from "./attached/changes/detach-one.js";
import * as m45 from "./attached/changes/purge-many.js";
import * as m46 from "./attached/changes/purge-one.js";
import * as m47 from "./attached/many.js";
import * as m48 from "./attached/model.js";
import * as m49 from "./attached/one.js";
import * as m50 from "./downloader.js";
import * as m51 from "./errors.js";
import * as m52 from "./gem-version.js";
import * as m53 from "./log-subscriber.js";
import * as m54 from "./previewer.js";
import * as m55 from "./previewer/mupdf-previewer.js";
import * as m56 from "./previewer/poppler-pdf-previewer.js";
import * as m57 from "./previewer/video-previewer.js";
import * as m58 from "./reflection.js";
import * as m59 from "./service.js";
import * as m60 from "./service/configurator.js";
import * as m61 from "./service/disk-service.js";
import * as m62 from "./service/mirror-service.js";
import * as m63 from "./service/registry.js";

defineConstants([
  [() => m20, "AnalyzeJob", "ActiveStorage::AnalyzeJob"],
  [() => m0, "Analyzer", "ActiveStorage::Analyzer"],
  [() => m1, "AudioAnalyzer", "ActiveStorage::Analyzer::AudioAnalyzer"],
  [() => m2, "ImageAnalyzer", "ActiveStorage::Analyzer::ImageAnalyzer"],
  [() => m3, "ImageMagick", "ActiveStorage::Analyzer::ImageAnalyzer::ImageMagick"],
  [() => m4, "Vips", "ActiveStorage::Analyzer::ImageAnalyzer::Vips"],
  [() => m5, "NullAnalyzer", "ActiveStorage::Analyzer::NullAnalyzer"],
  [() => m6, "VideoAnalyzer", "ActiveStorage::Analyzer::VideoAnalyzer"],
  [() => m36, "Attached", "ActiveStorage::Attached"],
  [() => m37, "Changes", "ActiveStorage::Attached::Changes"],
  [() => m38, "CreateMany", "ActiveStorage::Attached::Changes::CreateMany"],
  [() => m40, "CreateOne", "ActiveStorage::Attached::Changes::CreateOne"],
  [() => m39, "CreateOneOfMany", "ActiveStorage::Attached::Changes::CreateOneOfMany"],
  [() => m41, "DeleteMany", "ActiveStorage::Attached::Changes::DeleteMany"],
  [() => m42, "DeleteOne", "ActiveStorage::Attached::Changes::DeleteOne"],
  [() => m43, "DetachMany", "ActiveStorage::Attached::Changes::DetachMany"],
  [() => m44, "DetachOne", "ActiveStorage::Attached::Changes::DetachOne"],
  [() => m45, "PurgeMany", "ActiveStorage::Attached::Changes::PurgeMany"],
  [() => m46, "PurgeOne", "ActiveStorage::Attached::Changes::PurgeOne"],
  [() => m47, "Many", "ActiveStorage::Attached::Many"],
  [() => m48, "Model", "ActiveStorage::Attached::Model"],
  [() => m48, "ClassMethods", "ActiveStorage::Attached::Model::ClassMethods"],
  [() => m49, "One", "ActiveStorage::Attached::One"],
  [() => m26, "Attachment", "ActiveStorage::Attachment"],
  [() => m7, "BaseController", "ActiveStorage::BaseController"],
  [() => m21, "BaseJob", "ActiveStorage::BaseJob"],
  [() => m27, "Servable", "ActiveStorage::Blob::Servable"],
  [() => m8, "ProxyController", "ActiveStorage::Blobs::ProxyController"],
  [() => m9, "RedirectController", "ActiveStorage::Blobs::RedirectController"],
  [() => m28, "Current", "ActiveStorage::Current"],
  [() => m10, "DirectUploadsController", "ActiveStorage::DirectUploadsController"],
  [() => m15, "DisableSession", "ActiveStorage::DisableSession"],
  [() => m11, "DiskController", "ActiveStorage::DiskController"],
  [() => m50, "Downloader", "ActiveStorage::Downloader"],
  [() => m51, "Error", "ActiveStorage::Error"],
  [() => m29, "Filename", "ActiveStorage::Filename"],
  [() => m51, "FileNotFoundError", "ActiveStorage::FileNotFoundError"],
  [() => m16, "FileServer", "ActiveStorage::FileServer"],
  [() => m51, "IntegrityError", "ActiveStorage::IntegrityError"],
  [() => m51, "InvalidKeyError", "ActiveStorage::InvalidKeyError"],
  [() => m51, "InvariableError", "ActiveStorage::InvariableError"],
  [() => m53, "LogSubscriber", "ActiveStorage::LogSubscriber"],
  [() => m22, "MirrorJob", "ActiveStorage::MirrorJob"],
  [() => m30, "NamedVariant", "ActiveStorage::NamedVariant"],
  [() => m31, "Preview", "ActiveStorage::Preview"],
  [() => m54, "Previewer", "ActiveStorage::Previewer"],
  [() => m55, "MuPDFPreviewer", "ActiveStorage::Previewer::MuPDFPreviewer"],
  [() => m56, "PopplerPDFPreviewer", "ActiveStorage::Previewer::PopplerPDFPreviewer"],
  [() => m57, "VideoPreviewer", "ActiveStorage::Previewer::VideoPreviewer"],
  [() => m51, "PreviewError", "ActiveStorage::PreviewError"],
  [() => m23, "PreviewImageJob", "ActiveStorage::PreviewImageJob"],
  [() => m24, "PurgeJob", "ActiveStorage::PurgeJob"],
  [() => m32, "Record", "ActiveStorage::Record"],
  [() => m58, "ActiveRecordExtensions", "ActiveStorage::Reflection::ActiveRecordExtensions"],
  [() => m58, "ClassMethods", "ActiveStorage::Reflection::ActiveRecordExtensions::ClassMethods"],
  [() => m58, "HasAttachedReflection", "ActiveStorage::Reflection::HasAttachedReflection"],
  [() => m58, "HasManyAttachedReflection", "ActiveStorage::Reflection::HasManyAttachedReflection"],
  [() => m58, "HasOneAttachedReflection", "ActiveStorage::Reflection::HasOneAttachedReflection"],
  [() => m58, "ReflectionExtension", "ActiveStorage::Reflection::ReflectionExtension"],
  [() => m12, "BaseController", "ActiveStorage::Representations::BaseController"],
  [() => m13, "ProxyController", "ActiveStorage::Representations::ProxyController"],
  [() => m14, "RedirectController", "ActiveStorage::Representations::RedirectController"],
  [() => m59, "Service", "ActiveStorage::Service"],
  [() => m60, "Configurator", "ActiveStorage::Service::Configurator"],
  [() => m61, "DiskService", "ActiveStorage::Service::DiskService"],
  [() => m62, "MirrorService", "ActiveStorage::Service::MirrorService"],
  [() => m63, "Registry", "ActiveStorage::Service::Registry"],
  [() => m17, "SetBlob", "ActiveStorage::SetBlob"],
  [() => m18, "SetCurrent", "ActiveStorage::SetCurrent"],
  [() => m19, "Streaming", "ActiveStorage::Streaming"],
  [() => m25, "TransformJob", "ActiveStorage::TransformJob"],
  [() => m51, "UnpreviewableError", "ActiveStorage::UnpreviewableError"],
  [() => m51, "UnrepresentableError", "ActiveStorage::UnrepresentableError"],
  [() => m34, "Variant", "ActiveStorage::Variant"],
  [() => m33, "VariantWithRecord", "ActiveStorage::VariantWithRecord"],
  [() => m35, "Variation", "ActiveStorage::Variation"],
  [() => m52, "VERSION", "ActiveStorage::VERSION"],
]);
