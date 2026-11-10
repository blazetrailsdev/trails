import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import "../lib/index.js";
import { Mail } from "../lib/mail.js";
import { CheckDeliveryParams } from "../lib/check-delivery-params.js";
import type { Message } from "../lib/message.js";

describe("Mail::CheckDeliveryParams", () => {
  const fromAddr = "from@example.com";
  const toAddr = "to@example.org";
  let mail: Message;

  beforeEach(() => {
    mail = Mail.new({
      from: fromAddr,
      to: toAddr,
      subject: "Hello there Mikel",
      body: "This is a body of text",
    });
  });

  describe(".check", () => {
    it("returns the from, to array and encoded message in an array", () => {
      expect(CheckDeliveryParams.check(mail)).toEqual([fromAddr, [toAddr], mail.encoded()]);
    });

    it("raises error if From is blank", () => {
      mail.setFrom(null);
      expect(() => CheckDeliveryParams.check(mail)).toThrow(
        new ArgumentError("SMTP From address may not be blank: nil"),
      );
    });

    it("raises error if To is blank", () => {
      mail.setTo(null);
      expect(() => CheckDeliveryParams.check(mail)).toThrow(
        new ArgumentError("SMTP To address may not be blank: []"),
      );
    });
  });

  describe(".check_from", () => {
    it("returns the from address", () => {
      expect(CheckDeliveryParams.checkFrom(mail.smtpEnvelopeFrom() as string)).toEqual(fromAddr);
    });

    it("raises error if From is too long", () => {
      const longAddr = `${"bob".repeat(682)}@example.com`;
      expect(() => CheckDeliveryParams.checkFrom(longAddr)).toThrow(
        new ArgumentError(`SMTP From address may not exceed 2000 bytes: "${longAddr}"`),
      );
    });
  });

  describe(".check_to", () => {
    it("returns the to address array", () => {
      expect(CheckDeliveryParams.checkTo(mail.smtpEnvelopeTo())).toEqual([toAddr]);
    });

    it("raises error if To is too long", () => {
      const longAddr = `${"bob".repeat(682)}@example.com`;
      expect(() => CheckDeliveryParams.checkTo(longAddr)).toThrow(
        new ArgumentError(`SMTP To address may not exceed 2000 bytes: "${longAddr}"`),
      );
    });
  });

  describe(".check_addr", () => {
    it("returns the address if it is not too long", () => {
      expect(CheckDeliveryParams.checkAddr("From", mail.smtpEnvelopeFrom() as string)).toEqual(
        mail.smtpEnvelopeFrom(),
      );
    });

    it("raises error if address is too long", () => {
      const longAddr = `${"bob".repeat(682)}@example.com`;
      expect(() => CheckDeliveryParams.checkAddr("To", longAddr)).toThrow(
        new ArgumentError(`SMTP To address may not exceed 2000 bytes: "${longAddr}"`),
      );
    });
  });

  describe(".validate_smtp_addr", () => {
    it("returns the address is not too long", () => {
      expect(CheckDeliveryParams.validateSmtpAddr(mail.smtpEnvelopeFrom() as string)).toEqual(
        mail.smtpEnvelopeFrom(),
      );
    });

    it("returns error message if address contains LF", () => {
      const longAddr = "bob\n@example.com";

      CheckDeliveryParams.validateSmtpAddr(longAddr, (errorMessage) => {
        expect(errorMessage).toEqual("may not contain CR or LF line breaks");
      });
    });

    it("returns error message if address contains CR", () => {
      const longAddr = "bob\r@example.com";

      CheckDeliveryParams.validateSmtpAddr(longAddr, (errorMessage) => {
        expect(errorMessage).toEqual("may not contain CR or LF line breaks");
      });
    });

    it("returns error message if address is too long", () => {
      const longAddr = `${"bob".repeat(682)}@example.com`;

      CheckDeliveryParams.validateSmtpAddr(longAddr, (errorMessage) => {
        expect(errorMessage).toEqual("may not exceed 2kB");
      });
    });
  });

  describe(".check_message", () => {
    it("ensures the message is not blank", () => {
      expect(CheckDeliveryParams.checkMessage(mail.encoded())).toEqual(mail.encoded());
    });
  });
});
