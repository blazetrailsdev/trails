import { afterEach, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { type Response } from "@blazetrails/net-smtp";
import { Message } from "../../message.js";
import { SMTP } from "./smtp.js";

type Delivery = [message: string, from: string, to: string[]];
let deliveries: Delivery[] = [];
const servers: SMTPServer[] = [];

async function mockSmtp(): Promise<number> {
  deliveries = [];
  const server = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    logger: false,
    closeTimeout: 50,
    onData(stream, session, callback) {
      let data = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => (data += chunk));
      stream.on("end", () => {
        deliveries.push([
          data,
          session.envelope.mailFrom === false ? "<>" : session.envelope.mailFrom.address,
          session.envelope.rcptTo.map((r) => r.address),
        ]);
        callback();
      });
    },
  });
  server.on("error", () => {});
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return (server.server.address() as { port: number }).port;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
});

function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@moore.com");
  mail.setTo("marcel@amont.com");
  mail.setSubject("invalid RFC2822");
  return mail;
}

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

    it("should be able to return actual SMTP protocol response", async () => {
      const port = await mockSmtp();
      const response = await new SMTP({
        address: "127.0.0.1",
        port,
        returnResponse: true,
      }).deliverBang(buildMail());
      expect((response as Response).isSuccess()).toBe(true);
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

    it("should raise on SMTP injection via RCPT TO overflow", async () => {
      const port = await mockSmtp();
      const mail = buildMail();
      mail.setSmtpEnvelopeTo(`really.long.to@${"a".repeat(2000)}.com`);
      await expect(new SMTP({ address: "127.0.0.1", port }).deliverBang(mail)).rejects.toThrow(
        /SMTP To address may not exceed 2000 bytes/,
      );
    });
  });
});
