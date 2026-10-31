import type { Builder } from "./builder.js";
import type { MiniMagick } from "./mini-magick.js";
import type { Vips } from "./vips.js";

export const ImageProcessing = {
  loadPath: {
    MiniMagick: () => import("./mini-magick.js"),
    Vips: () => import("./vips.js"),
  } as Record<string, () => Promise<unknown>>,
} as {
  loadPath: Record<string, () => Promise<unknown>>;
  Builder?: typeof Builder;
  MiniMagick?: typeof MiniMagick;
  Vips?: typeof Vips;
};
