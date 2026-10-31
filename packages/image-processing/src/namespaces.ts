import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Builder } from "./builder.js";
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
    MiniMagick?: typeof MiniMagick;
    Vips?: typeof Vips;
  };
extend(ImageProcessing, Autoload);

ImageProcessing.autoload("MiniMagick");
ImageProcessing.autoload("Vips");
