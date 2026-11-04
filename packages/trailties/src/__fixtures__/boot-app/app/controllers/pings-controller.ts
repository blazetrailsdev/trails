import { ActionController } from "@blazetrails/actionpack";

export class PingsController extends ActionController.API {
  async show(): Promise<void> {
    await this.render({ json: { pong: true } });
  }
}
