import { Message } from "@blazetrails/mail";
import { rbFArray, rbObjAsString } from "@blazetrails/ruby-compat";

declare module "@blazetrails/mail/message" {
  interface Message {
    recipients(): unknown[];
  }
}

export function recipients(this: Message): unknown[] {
  return [
    ...rbFArray(this.to()),
    ...rbFArray(this.cc()),
    ...rbFArray(this.bcc()),
    ...rbFArray(this.header().get("x_original_to")).map((h) => rbObjAsString(h)),
    ...rbFArray(this.header().get("x_forwarded_to")).map((h) => rbObjAsString(h)),
  ];
}

Message.prototype.recipients = recipients;
