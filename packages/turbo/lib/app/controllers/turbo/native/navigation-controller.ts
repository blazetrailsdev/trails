import { ActionController } from "@blazetrails/actionpack";
import { Turbo } from "../../../../turbo-trails.js";

export class NavigationController extends ActionController.Base {
  async recede(): Promise<void> {
    await this.render({ html: "Going back…" });
  }

  async refresh(): Promise<void> {
    await this.render({ html: "Refreshing…" });
  }

  async resume(): Promise<void> {
    await this.render({ html: "Staying put…" });
  }
}
Turbo.Native.NavigationController = NavigationController;
