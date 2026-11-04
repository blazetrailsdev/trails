import { afterEach, describe, expect, it } from "vitest";
import { buildMail, closeMockSmtp, deliveries, mockSmtp } from "../../test-helpers/mock-smtp.js";
import { rbInspect } from "@blazetrails/ruby-compat";
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
  });

  describe("SMTP Envelope", () => {
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
  });
});
