import { Analyzer } from "../analyzer.js";
import type { Blob } from "../blob.js";

type Dimensions = { width: number; height: number };
type Metadata = { [k: string]: unknown };

export abstract class ImageAnalyzer<I extends Dimensions = Dimensions> extends Analyzer {
  static override isAccept(blob: Blob): boolean {
    return blob.isImage();
  }

  override async metadata(): Promise<Metadata> {
    return await this.readImage(async (image) => {
      if (await this.isRotatedImage(image)) {
        return { width: image.height, height: image.width };
      } else {
        return { width: image.width, height: image.height };
      }
    });
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  protected abstract readImage(block: (image: I) => Promise<Metadata>): Promise<Metadata>;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  protected abstract isRotatedImage(image: I): boolean | Promise<boolean>;
}
