import { afterEach, describe, expect, it } from "vitest";
import { buildMail, closeMockSmtp, deliveries, mockSmtp } from "../../test-helpers/mock-smtp.js";
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
      expect(deliveries[0][0]).toContain("Subject: invalid RFC2822\r\n");
      expect(deliveries[0][1]).toBe("smtp_from@example.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@example.com"]);
    });
  });

  describe("SMTP Envelope", () => {
    it("should raise on SMTP injection via MAIL FROM newlines", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("inject.from@example.com>\nRCPT TO:<inject.rcpt@example.com");
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        "SMTP From address may not contain CR or LF line breaks: " +
          '"inject.from@example.com>\\nRCPT TO:<inject.rcpt@example.com"',
      );
    });
  });
});
