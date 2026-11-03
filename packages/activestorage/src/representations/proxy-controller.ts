import type { ActionController } from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { DisableSession } from "../disable-session.js";
import { Streaming } from "../streaming.js";
import { BaseController } from "./base-controller.js";

export class ProxyController extends BaseController {
  declare sendStream: (typeof ActionController.Live)["sendStream"];
  declare private sendBlobStream: (typeof Streaming)["sendBlobStream"];

  static {
    include(this, Streaming);
    include(this, DisableSession);
  }

  async show(): Promise<void> {
    await this.httpCacheForever({ public: true }, async () => {
      await this.sendBlobStream(this.representation as never, {
        disposition: this.params.get("disposition") as string | undefined,
      });
    });
  }
}
ActiveStorage.Representations.ProxyController = ProxyController;
