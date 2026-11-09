import { ActionController } from "@blazetrails/actionpack";

export class UsersController extends ActionController.Base {
  async index(): Promise<void> {
    await this.render({ json: { users: [] } });
  }
}
