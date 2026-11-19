import { TopLevel } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../lib/turbo-trails.js";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    RequestIdsController?: typeof RequestIdsController;
  }
}

export class RequestIdsController extends ApplicationController {
  async show(): Promise<void> {
    await this.render({ json: { turbo_frame_request_id: Turbo.currentRequestId } });
  }
}
TopLevel.RequestIdsController = RequestIdsController;
