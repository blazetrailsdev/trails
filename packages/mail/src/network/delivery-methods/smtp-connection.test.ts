import { afterEach, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { Message } from "../../message.js";
import { SMTPConnection } from "./smtp-connection.js";

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
