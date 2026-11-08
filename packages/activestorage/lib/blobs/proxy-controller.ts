import { ActiveStorage } from "../active-storage.js";
import type { ActionController } from "@blazetrails/actionpack";
import { isPresent } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { BaseController } from "../base-controller.js";
import type { Blob } from "../blob.js";
import { DisableSession } from "../disable-session.js";
import { SetBlob } from "../set-blob.js";
import { Streaming } from "../streaming.js";

export class ProxyController extends BaseController {
  declare blob: Blob;
  declare sendStream: (typeof ActionController.Live)["sendStream"];
  declare private sendBlobByteRangeData: (typeof Streaming)["sendBlobByteRangeData"];
  declare private sendBlobStream: (typeof Streaming)["sendBlobStream"];

  static {
    include(this, SetBlob);
    include(this, Streaming);
    include(this, DisableSession);
  }

  async show(): Promise<void> {
    if (isPresent(this.request.headers.get("Range"))) {
      await this.sendBlobByteRangeData(this.blob, this.request.headers.get("Range") as string);
    } else {
      await this.httpCacheForever({ public: true }, async () => {
        this.response.headers.set("Accept-Ranges", "bytes");
        this.response.headers.set("Content-Length", this.blob.byte_size!.toString());

        await this.sendBlobStream(this.blob, {
          disposition: this.params.get("disposition") as string | undefined,
        });
      });
    }
  }
}
ActiveStorage.Blobs.ProxyController = ProxyController;
