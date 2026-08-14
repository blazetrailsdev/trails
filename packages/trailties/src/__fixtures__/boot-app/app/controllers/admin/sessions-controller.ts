import { ActionController } from "@blazetrails/actionpack";

export class SessionsController extends ActionController.Base {
  async index(): Promise<void> {
    this.render({ json: { scope: "admin" } });
  }
}
