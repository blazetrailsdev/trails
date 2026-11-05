import { afterEach, describe, expect, it } from "vitest";
import { buildMail, closeMockSmtp, deliveries, mockSmtp } from "../../test-helpers/mock-smtp.js";
import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";
import { Message } from "../../message.js";
import { SMTP } from "./smtp.js";

afterEach(closeMockSmtp);

describe("SMTP Delivery Method", () => {
  describe("general usage", () => {
    it("should send emails from given settings", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("smtp_from@example.com");
      mail.setSmtpEnvelopeTo("smtp_to@example.com");
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][0]).toBe(mail.encoded());
      expect(deliveries[0][1]).toBe("smtp_from@example.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@example.com"]);
    });

    it("should be able to send itself", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][0]).toBe(mail.encoded());
      expect(deliveries[0][1]).toBe((mail.from() as string[])[0]);
      expect(deliveries[0][2]).toEqual(mail.destinations());
    });

    it("should be able to return actual SMTP protocol response", async () => {
      const port = await mockSmtp();
      const response = await new SMTP({
        address: "127.0.0.1",
        port,
        returnResponse: true,
      }).deliverBang(buildMail());
      expect((response as { message: string }).message.slice(4).trim()).toBe("OK");
    });
  });

  describe("SMTP Envelope", () => {
    const envelopeMail = () => {
      const mail = new Message();
      mail.setTo("to@someemail.com");
      mail.setFrom("from@someemail.com");
      mail.setMessageId("<1234@someemail.com>");
      mail.setBody("body");
      mail.setSmtpEnvelopeTo("smtp_to@someemail.com");
      return mail;
    };

    it("uses the envelope From and To addresses", async () => {
      const port = await mockSmtp();
      const mail = envelopeMail();
      mail.setSmtpEnvelopeFrom("smtp_from@someemail.com");
      await new SMTP({ address: "127.0.0.1", port }).deliverBang(mail);
      expect(deliveries[0][1]).toBe("smtp_from@someemail.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@someemail.com"]);
    });

    it("should raise an error if there is no envelope From address", async () => {
      const mail = new Message();
      mail.setTo("to@somemail.com");
      mail.setSubject("Email with no sender");
      mail.setBody("body");
      expect(mail.smtpEnvelopeFrom()).toBeNull();
      const port = await mockSmtp();
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError("SMTP From address may not be blank: nil"),
      );
    });

    it("should raise an error if no recipient if defined", async () => {
      const mail = new Message();
      mail.setFrom("from@somemail.com");
      mail.setSubject("Email with no recipient");
      mail.setBody("body");
      expect(mail.smtpEnvelopeTo()).toEqual([]);
      const port = await mockSmtp();
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError("SMTP To address may not be blank: []"),
      );
    });

    it("should raise on SMTP injection via MAIL FROM newlines", async () => {
      const port = await mockSmtp();
      const addr = "inject.from@example.com>\r\nDATA";
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom(addr);
      expect(mail.smtpEnvelopeFrom()).toBe(addr);
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        `SMTP From address may not contain CR or LF line breaks: ${rbInspect(addr)}`,
      );
    });

    const injected = async (from: string, to: string, message: string) => {
      const port = await mockSmtp();
      const mail = new Message();
      mail.setFrom(from);
      mail.setTo(to);
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        new ArgumentError(message),
      );
      return mail;
    };

    it("should raise on SMTP injection via RCPT TO newlines", async () => {
      const addr = "inject.to@example.com>\r\nDATA";
      const mail = await injected(
        "from@somemail.com",
        addr,
        `SMTP To address may not contain CR or LF line breaks: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeTo()).toEqual([addr]);
    });

    it("should raise on SMTP injection via MAIL FROM overflow", async () => {
      const addr = `inject.from@example.com${"m".repeat(2000)}`;
      const mail = await injected(
        addr,
        "to@somemail.com",
        `SMTP From address may not exceed 2000 bytes: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeFrom()).toBe(addr);
    });

    it("should raise on SMTP injection via RCPT TO overflow", async () => {
      const addr = `inject.to@example.com${"m".repeat(2000)}`;
      const mail = await injected(
        "from@somemail.com",
        addr,
        `SMTP To address may not exceed 2000 bytes: ${rbInspect(addr)}`,
      );
      expect(mail.smtpEnvelopeTo()).toEqual([addr]);
    });
  });
});
