import { ActiveStorage } from "../../active-storage.js";
import type { Blob } from "../../blob.js";
import { ImageAnalyzer } from "../image-analyzer.js";

type Metadata = { [k: string]: unknown };
type ReadImage = { width: number; height: number; getString(name: string): string };

const ROTATIONS = /Right-top|Left-bottom|Top-right|Bottom-left|^[2468] \(/;

export class Vips extends ImageAnalyzer<ReadImage> {
  static readonly ROTATIONS = ROTATIONS;

  static override isAccept(blob: Blob): boolean {
    return super.isAccept(blob) && ActiveStorage.variantProcessor === "vips";
  }

  /** @internal */
  protected override async readImage(
    block: (image: ReadImage) => Promise<Metadata>,
  ): Promise<Metadata> {
    let vips;
    try {
      vips = (await import("@blazetrails/image-processing/vips")).vips;
    } catch (error) {
      if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      this.logger.info("Skipping image analysis because the ruby-vips gem isn't installed");
      return {};
    }

    return await this.downloadBlobToTempfile(async (file) => {
      try {
        const image = this.instrument("vips", () => {
          try {
            return vips.Image.newFromFile(file.path()!, { access: "sequential" });
          } catch (error) {
            if (error instanceof WebAssembly.Exception) {
              this.logger.info("Skipping image analysis because Vips doesn't support the file");
              return null;
            }
            throw error;
          }
        });

        if (image) {
          return await block(image);
        } else {
          return {};
        }
      } catch (error) {
        if (error instanceof WebAssembly.Exception) {
          this.logger.error(
            `Skipping image analysis due to a Vips error: ${[Reflect.get(error, "message")].flat().at(-1)}`,
          );
          return {};
        }
        throw error;
      }
    });
  }

  /**
   * @internal
   * @inventedArm getString — PERMANENT
   */
  protected override isRotatedImage(image: ReadImage): boolean {
    try {
      return ROTATIONS.test(image.getString("exif-ifd0-Orientation"));
    } catch (error) {
      if (error instanceof WebAssembly.Exception) return false;
      throw error;
    }
  }
}
