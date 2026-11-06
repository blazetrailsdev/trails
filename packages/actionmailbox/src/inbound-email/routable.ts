import "../constants.routable.generated.js";
import { Concern, extend } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import type { InboundEmail } from "../inbound-email.js";
import { RoutingJob } from "../routing-job.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    ApplicationMailbox?: { route(inboundEmail: InboundEmail): Promise<unknown> };
  }
}

export const Routable = {
  async routeLater(this: InboundEmail): Promise<unknown> {
    return await RoutingJob.performLater(this);
  },

  async route(this: InboundEmail): Promise<unknown> {
    return await TopLevel.ApplicationMailbox!.route(this);
  },
};
extend(Routable, Concern);
Concern.included.call(Routable as never, null, function (this: typeof InboundEmail) {
  this.afterCreateCommit(":routeLater", { if: ":isPending" });
});
