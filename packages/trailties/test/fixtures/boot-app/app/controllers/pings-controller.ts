import { ActionController } from "@blazetrails/actionpack";
import { Trails } from "../../../../../lib/trails.js";

export class PingsController extends ActionController.API {
  async show(): Promise<void> {
    await this.render({ json: { pong: true } });
  }

  async setting(): Promise<void> {
    await this.render({ plain: String(Trails.application!.config.x.boot.setting) });
  }
}
