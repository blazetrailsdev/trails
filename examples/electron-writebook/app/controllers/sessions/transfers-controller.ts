import { ApplicationController } from "../application-controller.ts";
import { User } from "../../models/user.ts";

export class TransfersController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess();
  }

  async show(): Promise<void> {}

  async update(): Promise<void> {
    const user = await (User.active() as unknown as typeof User).findByTransferId(
      String(this.params.get("id")),
    );
    if (user) {
      await this.startNewSessionFor(user);
      await this.redirectTo(this.postAuthenticatingUrl());
    } else {
      await this.head(":bad_request");
    }
  }
}
