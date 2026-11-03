import { ActiveStorage } from "../active-storage.js";
import { BaseController } from "../base-controller.js";
import type { Blob } from "../blob.js";
import { include } from "@blazetrails/ruby-compat";
import { SetBlob } from "../set-blob.js";

export class RedirectController extends BaseController {
  declare blob: Blob;

  static {
    include(this, SetBlob);
  }

  async show(): Promise<void> {
    this.expiresIn(ActiveStorage.serviceUrlsExpireIn);
    this.redirectTo(
      await this.blob.url({ disposition: this.params.get("disposition") as string | undefined }),
      { allowOtherHost: true },
    );
  }
}
ActiveStorage.Blobs.RedirectController = RedirectController;
