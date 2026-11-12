import { ArgumentError, Gem, rbFArray, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Mail } from "./mail.js";
import type { Message } from "./message.js";
import { SmtpEnvelope } from "./smtp-envelope.js";
import { Utilities } from "./utilities.js";

export const CheckDeliveryParams = {
  check(mail: Message): [string, string[], string | Uint8Array] {
    const envelope = new SmtpEnvelope(mail);
    return [envelope.from, envelope.to, envelope.message];
  },

  checkFrom(addr: string): string {
    const mail = Mail.new({ from: "deprecated@example.com", to: "deprecated@example.com" });
    return new SmtpEnvelope(mail)["validateAddr"]("From", addr);
  },

  checkTo(addrs: unknown): string[] {
    const mail = Mail.new({ from: "deprecated@example.com", to: "deprecated@example.com" });
    return rbFArray(addrs).map((addr) =>
      new SmtpEnvelope(mail)["validateAddr"]("To", addr as string),
    );
  },

  checkAddr(addrName: string, addr: string): string {
    const mail = Mail.new({ from: "deprecated@example.com", to: "deprecated@example.com" });
    return new SmtpEnvelope(mail)["validateAddr"](addrName, addr);
  },

  validateSmtpAddr(addr: string | null, block?: (message: string) => unknown): string | null {
    if (addr != null) {
      if (new TextEncoder().encode(addr).length > 2048) {
        block!("may not exceed 2kB");
      }

      if (/[\r\n]/.test(addr)) {
        block!("may not contain CR or LF line breaks");
      }
    }

    return addr;
  },

  checkMessage(message: unknown): unknown {
    if (rbObjRespondTo(message, "encoded")) message = (message as Message).encoded();

    if (Utilities.isBlank(message)) {
      throw new ArgumentError("An encoded message is required to send an email");
    }

    return message;
  },
};

const { deprecate } = Gem.Deprecate;
deprecate.call(
  CheckDeliveryParams,
  "check",
  "Mail::SmtpEnvelope.new created in commit c106bebea066782a72e4f24dd37b532d95773df7",
  2023,
  6,
);
deprecate.call(CheckDeliveryParams, "checkFrom", "none", 2023, 6);
deprecate.call(CheckDeliveryParams, "checkTo", "none", 2023, 6);
deprecate.call(CheckDeliveryParams, "checkAddr", "none", 2023, 6);
deprecate.call(CheckDeliveryParams, "validateSmtpAddr", "none", 2023, 6);
deprecate.call(CheckDeliveryParams, "checkMessage", "none", 2023, 6);

Mail.CheckDeliveryParams = CheckDeliveryParams;
