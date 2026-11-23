import { ActionController } from "@blazetrails/actionpack";
import { Trails } from "@blazetrails/trailties";

export class BaseController extends ActionController.Base {
  declare readonly mainApp: Record<string, (...args: unknown[]) => string>;

  static {
    this.layout("trails/conductor");
    this.beforeAction(":ensureDevelopmentEnv");
  }

  /** @internal */
  private async ensureDevelopmentEnv(): Promise<void> {
    if (!Trails.env.isDevelopment()) await this.head(":forbidden");
  }
}
