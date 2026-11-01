import { ActionController } from "@blazetrails/actionpack";

export class LikesController extends ActionController.API {
  async show(): Promise<void> {
    await this.render({ json: { liked: true } });
  }
}
