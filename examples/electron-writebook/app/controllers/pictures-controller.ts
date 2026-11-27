import type { Parameters } from "@blazetrails/actionpack";
import { LeafablesController } from "./leafables-controller.ts";
import { Picture } from "../models/picture.ts";

export class PicturesController extends LeafablesController {
  declare picture: Picture;

  protected override async newLeafable(): Promise<Picture> {
    const leafable = new Picture();
    await leafable.setAttributes(this.leafableParams());
    return leafable;
  }

  protected override leafableParams(): Parameters {
    return this.uploadedFilesOnly(
      (this.params.fetch("picture", {}) as Parameters).permit("image", "caption"),
      "image",
    );
  }
}
