import {
  OrderedOptions,
  InheritableOptions,
  onLoad,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { File, include, prepend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { Reflection, type Base } from "@blazetrails/activerecord";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ActiveStorage } from "./active-storage.js";
import { Model } from "./attached/model.js";
import { ImageMagick } from "./analyzer/image-analyzer/image-magick.js";
import { Vips } from "./analyzer/image-analyzer/vips.js";
import { VideoAnalyzer } from "./analyzer/video-analyzer.js";
import { AudioAnalyzer } from "./analyzer/audio-analyzer.js";
import { MuPDFPreviewer } from "./previewer/mupdf-previewer.js";
import { PopplerPDFPreviewer } from "./previewer/poppler-pdf-previewer.js";
import { VideoPreviewer } from "./previewer/video-previewer.js";
import { ActiveRecordExtensions, ReflectionExtension } from "./reflection.js";

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActiveStorage);

    this.config.paths().add("config/routes.ts", {
      with: File.join(import.meta.dirname, "config", `routes${File.extname(import.meta.filename)}`),
    });

    const activeStorage = new OrderedOptions() as unknown as { [k: string]: unknown };
    this.config.set("activeStorage", activeStorage);
    activeStorage.previewers = [PopplerPDFPreviewer, MuPDFPreviewer, VideoPreviewer];
    activeStorage.analyzers = [Vips, ImageMagick, VideoAnalyzer, AudioAnalyzer];
    activeStorage.paths = new OrderedOptions();
    activeStorage.queues = new InheritableOptions();
    activeStorage.precompileAssets = true;

    this.initializer("active_storage.configs", () => {
      this.config.afterInitialize((app) => {
        const config = app.config.get("activeStorage") as typeof activeStorage;
        ActiveStorage.previewers = (config.previewers as typeof ActiveStorage.previewers) ?? [];
        ActiveStorage.analyzers = (config.analyzers as typeof ActiveStorage.analyzers) ?? [];
      });
    });

    this.initializer("active_storage.attached", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Model);
      });
    });

    this.initializer("active_storage.reflection", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, ActiveRecordExtensions);
        prepend(rbObjSingletonClass(Reflection), ReflectionExtension);
        runLoadHooks("active_storage_reflection", Reflection);
      });
    });
  }
}
