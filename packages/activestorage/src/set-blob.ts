import type { ActionController } from "@blazetrails/actionpack";
import { Concern, extend } from "@blazetrails/activesupport";
import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { Blob } from "./blob.js";

type ControllerClass = typeof ActionController.Base;

interface SetBlobHost {
  blob: Blob;
  params: { get(key: string): string | null | undefined };
  head(status: string): void;
  blobScope(): typeof Blob;
}

export const SetBlob = {
  /** @internal */
  async setBlob(this: SetBlobHost): Promise<void> {
    try {
      this.blob = await this.blobScope().findSignedBang(
        this.params.get("signed_blob_id") ?? this.params.get("signed_id")!,
      );
    } catch (error) {
      if (!(error instanceof InvalidSignature)) throw error;
      this.head("not_found");
    }
  },

  /** @internal */
  blobScope(this: SetBlobHost): typeof Blob {
    return Blob;
  },
};
extend(SetBlob, Concern);
(
  SetBlob as unknown as { included(base: null, block: (this: ControllerClass) => void): void }
).included(null, function (this: ControllerClass) {
  this.beforeAction("setBlob");
});
