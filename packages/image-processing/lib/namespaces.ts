import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Builder } from "./builder.js";
import type { Chainable } from "./chainable.js";
import type { Error } from "./image-processing.js";
import type { Pipeline } from "./pipeline.js";
import type { Processor } from "./processor.js";
import type { MiniMagick } from "./mini-magick.js";
import type { Vips } from "./vips.js";

export const ImageProcessing = {
  name: "ImageProcessing",
  loadPath: {
    "image_processing/mini_magick": () => import("./mini-magick.js"),
    "image_processing/vips": () => import("./vips.js"),
  },
} as unknown as Autoload.Autoload &
  Extended<typeof Autoload> & {
    Builder?: typeof Builder;
    Chainable?: typeof Chainable;
    Error?: typeof Error;
    Pipeline?: typeof Pipeline;
    Processor?: typeof Processor;
    MiniMagick?: typeof MiniMagick;
    Vips?: typeof Vips;
  };
extend(ImageProcessing, Autoload);

ImageProcessing.autoload("MiniMagick");
ImageProcessing.autoload("Vips");

constSet(TopLevel, "ImageProcessing", ImageProcessing);
