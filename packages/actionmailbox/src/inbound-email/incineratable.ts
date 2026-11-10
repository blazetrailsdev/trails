import { Concern, extend } from "@blazetrails/activesupport";
import { ActionMailbox } from "../action-mailbox.js";
import type { InboundEmail } from "../inbound-email.js";
import { IncinerationJob } from "../incineration-job.js";
import { Incineration } from "./incineratable/incineration.js";

export const Incineratable = {
  Incineration,

  async incinerateLater(this: InboundEmail): Promise<unknown> {
    return await IncinerationJob.schedule(this);
  },

  async incinerate(this: InboundEmail): Promise<unknown> {
    return await new Incineration(this).run();
  },
};
extend(Incineratable, Concern);
Concern.included.call(Incineratable as never, null, function (this: typeof InboundEmail) {
  this.afterUpdateCommit(":incinerateLater", {
    if: (inboundEmail: InboundEmail) =>
      ActionMailbox.incinerate != null &&
      ActionMailbox.incinerate !== false &&
      inboundEmail.statusPreviouslyChanged() &&
      inboundEmail.isProcessed(),
  });
});
