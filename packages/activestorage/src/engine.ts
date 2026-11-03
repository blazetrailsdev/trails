import {
  OrderedOptions,
  InheritableOptions,
  compactBlank,
  minutes,
  onLoad,
  runLoadHooks,
  TopLevel,
  type Duration,
} from "@blazetrails/activesupport";
import {
  File,
  getPath,
  env,
  include,
  prepend,
  rbObjSingletonClass,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Reflection, type Base } from "@blazetrails/activerecord";
import { setMultipleFileFieldIncludeHidden } from "@blazetrails/actionview/helpers/form-helper";
import type { TestCase } from "@blazetrails/activesupport/test-case";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ActiveStorage } from "./active-storage.js";
import "./deprecator.js";
import { Model } from "./attached/model.js";
import { ActiveRecordExtensions, ReflectionExtension } from "./reflection.js";
import { PopplerPDFPreviewer } from "./previewer/poppler-pdf-previewer.js";
import { MuPDFPreviewer } from "./previewer/mupdf-previewer.js";
import { VideoPreviewer } from "./previewer/video-previewer.js";
import { ImageMagick } from "./analyzer/image-analyzer/image-magick.js";
import { Vips } from "./analyzer/image-analyzer/vips.js";
import { VideoAnalyzer } from "./analyzer/video-analyzer.js";
import { AudioAnalyzer } from "./analyzer/audio-analyzer.js";
import { Registry } from "./service/registry.js";
import { FixtureSet } from "./fixture-set.js";
import type { Blob } from "./blob.js";

export interface ActiveStorageConfig extends OrderedOptions {
  logger?: (typeof ActiveStorage)["logger"];
  variantProcessor?: string;
  previewers?: (typeof ActiveStorage)["previewers"];
  analyzers?: (typeof ActiveStorage)["analyzers"];
  paths?: OrderedOptions;
  routesPrefix?: string;
  drawRoutes?: boolean;
  resolveModelToRoute?: string;
  supportedImageProcessingMethods?: string[];
  unsupportedImageProcessingArguments?: unknown;
  variableContentTypes?: string[];
  webImageContentTypes?: string[];
  contentTypesToServeAsBinary?: string[];
  touchAttachmentRecords?: boolean;
  serviceUrlsExpireIn?: Duration;
  urlsExpireIn?: Duration | null;
  contentTypesAllowedInline?: string[];
  binaryContentType?: string;
  videoPreviewArguments?: string;
  trackVariants?: boolean;
  queues?: InheritableOptions;
  precompileAssets?: boolean;
  serviceConfigurations?: Record<string, Record<string, unknown>>;
  service?: string | null;
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    activeStorage: ActiveStorageConfig;
  }
}

/** @missingRailsCall parse — PERMANENT */
export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActiveStorage);

    this.config.paths().add("config/routes.ts", {
      with: File.join(import.meta.dirname, "config", `routes${File.extname(import.meta.filename)}`),
    });

    this.config.set("activeStorage", new OrderedOptions());
    this.config.activeStorage.previewers = [PopplerPDFPreviewer, MuPDFPreviewer, VideoPreviewer];
    this.config.activeStorage.analyzers = [Vips, ImageMagick, VideoAnalyzer, AudioAnalyzer];
    this.config.activeStorage.paths = new OrderedOptions();
    this.config.activeStorage.queues = new InheritableOptions();
    this.config.activeStorage.precompileAssets = true;

    this.config.activeStorage.variableContentTypes = [
      "image/png",
      "image/gif",
      "image/jpeg",
      "image/tiff",
      "image/bmp",
      "image/vnd.adobe.photoshop",
      "image/vnd.microsoft.icon",
      "image/webp",
      "image/avif",
      "image/heic",
      "image/heif",
    ];

    this.config.activeStorage.webImageContentTypes = ["image/png", "image/jpeg", "image/gif"];

    this.config.activeStorage.contentTypesToServeAsBinary = [
      "text/html",
      "image/svg+xml",
      "application/postscript",
      "application/x-shockwave-flash",
      "text/xml",
      "application/xml",
      "application/xhtml+xml",
      "application/mathml+xml",
      "text/cache-manifest",
    ];

    this.config.activeStorage.contentTypesAllowedInline = [
      "image/webp",
      "image/avif",
      "image/png",
      "image/gif",
      "image/jpeg",
      "image/tiff",
      "image/bmp",
      "image/vnd.adobe.photoshop",
      "image/vnd.microsoft.icon",
      "application/pdf",
    ];

    this.config.eagerLoadNamespaces.push(ActiveStorage);

    this.initializer("active_storage.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("activeStorage", ActiveStorage.deprecator());
    });

    this.initializer("active_storage.configs", () => {
      this.config.afterInitialize((app) => {
        const activeStorage = app.config.activeStorage;
        ActiveStorage.logger = activeStorage.logger || TopLevel.Trails!.logger!;
        ActiveStorage.variantProcessor = activeStorage.variantProcessor || "mini_magick";
        ActiveStorage.previewers = activeStorage.previewers || [];
        ActiveStorage.analyzers = activeStorage.analyzers || [];
        ActiveStorage.paths = (activeStorage.paths || {}) as Record<string, unknown>;
        ActiveStorage.routesPrefix = activeStorage.routesPrefix || "/trails/active_storage";
        ActiveStorage.drawRoutes = activeStorage.drawRoutes !== false;
        ActiveStorage.resolveModelToRoute =
          activeStorage.resolveModelToRoute || "trails_storage_redirect";

        ActiveStorage.supportedImageProcessingMethods = [
          ...ActiveStorage.supportedImageProcessingMethods,
          ...(activeStorage.supportedImageProcessingMethods || []),
        ];
        ActiveStorage.unsupportedImageProcessingArguments =
          activeStorage.unsupportedImageProcessingArguments || [
            "-debug",
            "-display",
            "-distribute-cache",
            "-help",
            "-path",
            "-print",
            "-set",
            "-verbose",
            "-version",
            "-write",
            "-write-mask",
          ];

        ActiveStorage.variableContentTypes = activeStorage.variableContentTypes || [];
        ActiveStorage.webImageContentTypes = activeStorage.webImageContentTypes || [];
        ActiveStorage.contentTypesToServeAsBinary = activeStorage.contentTypesToServeAsBinary || [];
        ActiveStorage.touchAttachmentRecords = activeStorage.touchAttachmentRecords !== false;
        ActiveStorage.serviceUrlsExpireIn = activeStorage.serviceUrlsExpireIn || minutes(5);
        ActiveStorage.urlsExpireIn = activeStorage.urlsExpireIn ?? null;
        ActiveStorage.contentTypesAllowedInline = activeStorage.contentTypesAllowedInline || [];
        ActiveStorage.binaryContentType =
          activeStorage.binaryContentType || "application/octet-stream";
        ActiveStorage.videoPreviewArguments =
          activeStorage.videoPreviewArguments || "-y -vframes 1 -f image2";
        ActiveStorage.trackVariants = activeStorage.trackVariants || false;
      });
    });

    this.initializer("active_storage.attached", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Model);
      });
    });

    this.initializer("active_storage.verifier", () => {
      this.config.afterInitialize((app) => {
        ActiveStorage.verifier = app.messageVerifier("ActiveStorage");
      });
    });

    this.initializer("active_storage.services", async () => {
      let configFile = File.join(
        TopLevel.Trails!.root()!,
        `config/storage/${TopLevel.Trails!.env}.ts`,
      );
      if (!(await File.isExistAsync(configFile)))
        configFile = File.join(TopLevel.Trails!.root()!, "config/storage.ts");
      const configFileExist = await File.isExistAsync(configFile);
      const mod: { default?: Record<string, Record<string, unknown>> } | null =
        configFileExist &&
        (TopLevel.Trails!.configuration as unknown as { activeStorage: ActiveStorageConfig })
          .activeStorage.serviceConfigurations == null
          ? await import(getPath().pathToFileURL!(configFile).href)
          : null;

      onLoad("active_storage_blob", () => {
        const activeStorage = (
          TopLevel.Trails!.configuration as unknown as { activeStorage: ActiveStorageConfig }
        ).activeStorage;
        const configs = (activeStorage.serviceConfigurations ||= (() => {
          if (!configFileExist)
            throw new RuntimeError(`Couldn't find Active Storage configuration in ${configFile}`);

          return mod!.default ?? {};
        })());

        const blob = ActiveStorage.Blob as typeof Blob;
        blob.services = new Registry(configs);

        const configChoice = activeStorage.service;
        if (configChoice != null) {
          blob.service = blob.services.fetch(configChoice);
        }
      });
    });

    this.initializer("active_storage.queues", () => {
      this.config.afterInitialize((app) => {
        ActiveStorage.queues = (app.config.activeStorage.queues || {}) as Record<string, unknown>;
      });
    });

    this.initializer("active_storage.reflection", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, ActiveRecordExtensions);
        prepend(rbObjSingletonClass(Reflection), ReflectionExtension);
        runLoadHooks("active_storage_reflection", Reflection);
      });
    });

    this.initializer("action_view.configuration", () => {
      this.config.afterInitialize((app) => {
        onLoad("action_view", () => {
          const multipleFileFieldIncludeHidden = app.config.activeStorage.delete(
            "multipleFileFieldIncludeHidden",
          ) as boolean | null | undefined;

          if (multipleFileFieldIncludeHidden != null) {
            setMultipleFileFieldIncludeHidden(multipleFileFieldIncludeHidden);
          }
        });
      });
    });

    this.initializer("active_storage.asset", () => {
      this.config.afterInitialize((app) => {
        if (app.config.isRespondTo("assets") && app.config.activeStorage.precompileAssets) {
          const assets = app.config.get("assets") as { precompile: string[] };
          assets.precompile = [...assets.precompile, "activestorage", "activestorage.esm"];
        }
      });
    });

    this.initializer("active_storage.fixture_set", () => {
      onLoad("active_record_fixture_set", () => {
        FixtureSet.fileFixturePath ||= File.join(
          TopLevel.Trails!.root()!,
          ...(compactBlank<string | undefined>([
            env.FIXTURES_PATH ?? File.join("test", "fixtures"),
            env.FIXTURES_DIR,
            "files",
          ]) as string[]),
        );
      });

      onLoad("active_support_test_case", function (this: typeof TestCase) {
        FixtureSet.fileFixturePath = this.fileFixturePath;
      });
    });
  }
}
