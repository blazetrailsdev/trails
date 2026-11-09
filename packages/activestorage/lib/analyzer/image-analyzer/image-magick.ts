import { ActiveStorage } from "../../active-storage.js";
import type { Blob } from "../../blob.js";
import { ImageAnalyzer } from "../image-analyzer.js";

type Metadata = { [k: string]: unknown };
type ReadImage = { width: number; height: number; get(value: unknown): unknown };

export class ImageMagick extends ImageAnalyzer<ReadImage> {
  static override isAccept(blob: Blob): boolean {
    return super.isAccept(blob) && ActiveStorage.variantProcessor === "mini_magick";
  }

  /**
   * @internal
   * @inventedArm get — PERMANENT
   */
  protected override async readImage(
    block: (image: ReadImage) => Promise<Metadata>,
  ): Promise<Metadata> {
    let MiniMagick;
    try {
      MiniMagick = {
        Image: (await import("@blazetrails/mini-magick/image")).Image,
        Error: (await import("@blazetrails/mini-magick/mini-magick")).Error,
      };
    } catch (error) {
      if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      this.logger.info("Skipping image analysis because the mini_magick gem isn't installed");
      return {};
    }

    return await this.downloadBlobToTempfile(async (file) => {
      try {
        const image = this.instrument("mini_magick", () => new MiniMagick.Image(file.path()!));

        if (await image.isValid()) {
          return await block({
            width: await image.width(),
            height: await image.height(),
            get: (value) => image.get(value),
          });
        } else {
          this.logger.info("Skipping image analysis because ImageMagick doesn't support the file");
          return {};
        }
      } catch (error) {
        if (error instanceof MiniMagick.Error) {
          this.logger.error(
            `Skipping image analysis due to an ImageMagick error: ${error.message}`,
          );
          return {};
        }
        throw error;
      }
    });
  }

  /** @internal */
  protected override async isRotatedImage(image: ReadImage): Promise<boolean> {
    return ["RightTop", "LeftBottom", "TopRight", "BottomLeft"].includes(
      (await image.get("%[orientation]")) as string,
    );
  }
}
