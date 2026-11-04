import { ActiveStorage } from "../active-storage.js";
import { BaseController } from "./base-controller.js";

export class RedirectController extends BaseController {
  async show(): Promise<void> {
    this.expiresIn(ActiveStorage.serviceUrlsExpireIn);
    this.redirectTo(
      (await this.representation.url({
        disposition: this.params.get("disposition") as string | undefined,
      })) as string,
      { allowOtherHost: true },
    );
  }
}
ActiveStorage.Representations.RedirectController = RedirectController;
