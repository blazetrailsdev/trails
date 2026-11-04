import { SMTPServer } from "smtp-server";
import { Message } from "../message.js";

type Delivery = [message: string, from: string, to: string[]];
export let deliveries: Delivery[] = [];
const servers: SMTPServer[] = [];

export async function mockSmtp(): Promise<number> {
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

export function closeMockSmtp(): Promise<unknown> {
  return Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
}

export function buildMail(): Message {
  const mail = new Message();
  mail.setFrom("roger@moore.com");
  mail.setTo("marcel@amont.com");
  mail.setSubject("invalid RFC2822");
  return mail;
}
