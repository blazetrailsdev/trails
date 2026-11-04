import { afterEach, describe, expect, it } from "vitest";
import { closeMockSmtp, deliveries, mockSmtp } from "../../test-helpers/mock-smtp.js";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { Message } from "../../message.js";
import { SMTPConnection } from "./smtp-connection.js";

afterEach(closeMockSmtp);

function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@moore.com");
  mail.setTo("marcel@amont.com");
  mail.setSubject("invalid RFC2822");
  return mail;
}

describe("SMTP Delivery Method", () => {
  it("should send an email using open SMTP connection", async () => {
    const port = await mockSmtp();
    const smtp = (await NetSMTP.start("127.0.0.1", port)) as NetSMTP;
    try {
      const mail = buildMail();
      mail.setSmtpEnvelopeFrom("smtp_from@example.com");
      mail.setSmtpEnvelopeTo("smtp_to@example.com");
      await new SMTPConnection({ connection: smtp }).deliverBang(mail);
      expect(deliveries[0][1]).toBe("smtp_from@example.com");
      expect(deliveries[0][2]).toEqual(["smtp_to@example.com"]);
    } finally {
      await smtp.finish();
    }
  });
});
