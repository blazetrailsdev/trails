import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { include } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../../../../active-storage.js";
import { BaseController as ActiveStorageBaseController } from "../base-controller.js";
import type { Blob } from "../../../models/active-storage/blob.js";
import type { Preview } from "../../../models/active-storage/preview.js";
import type { Variant } from "../../../models/active-storage/variant.js";
import type { VariantWithRecord } from "../../../models/active-storage/variant-with-record.js";
import { SetBlob } from "../../concerns/active-storage/set-blob.js";

export class BaseController extends ActiveStorageBaseController {
  declare blob: Blob;
  declare representation: Preview | Variant | VariantWithRecord;

  static {
    include(this, SetBlob);
    this.beforeAction(":setRepresentation");
  }

  /** @internal */
  blobScope(): typeof Blob {
    return ActiveStorage.Blob!.scopeForStrictLoading() as unknown as typeof Blob;
  }

  /** @internal */
  async setRepresentation(): Promise<void> {
    try {
      this.representation = await this.blob
        .representation(this.params.get("variation_key") as string)
        .processed();
    } catch (error) {
      if (!(error instanceof InvalidSignature)) throw error;
      await this.head(":not_found");
    }
  }
}

ActiveStorage.Representations.BaseController = BaseController;
