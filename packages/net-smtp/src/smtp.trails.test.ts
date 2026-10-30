import { afterEach, describe, expect, it } from "vitest";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { SMTP, SMTPFatalError } from "./smtp.js";

const servers: SMTPServer[] = [];

async function fakeServerStart(options: SMTPServerOptions = {}): Promise<number> {
  const server = new SMTPServer({
    disabledCommands: options.secure ? ["STARTTLS", "AUTH"] : ["AUTH", "STARTTLS"],
    hideSize: true,
    hidePIPELINING: true,
    hide8BITMIME: true,
    hideSMTPUTF8: true,
    hideENHANCEDSTATUSCODES: true,
    hideDSN: true,
    logger: false,
    closeTimeout: 50,
    onAuth(auth, _session, callback) {
      if (auth.password === "password" || auth.accessToken === "token") {
        callback(null, { user: auth.username });
      } else {
        callback(new Error("authentication failed"));
      }
    },
    onData(stream, _session, callback) {
      stream.resume();
      stream.on("end", () => callback());
    },
    ...options,
  });
  server.on("error", () => {});
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return (server.server.address() as { port: number }).port;
}

describe("SMTP (trails)", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  it("data guards its message and block arguments", async () => {
    const smtp = new SMTP("localhost", 25);
    await expect(smtp.data()).rejects.toThrow("message or block is required");
    await expect(smtp.data("m", () => {})).rejects.toThrow("message and block are exclusive");
  });

  it("refused recipient stops before data", async () => {
    let delivered = false;
    const port = await fakeServerStart({
      onRcptTo(address, _session, callback) {
        const refused = address.address === "bad@example.com";
        callback(refused ? Object.assign(new Error("no"), { responseCode: 550 }) : undefined);
      },
      onData(stream, _session, callback) {
        delivered = true;
        stream.resume();
        stream.on("end", () => callback());
      },
    });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    await expect(
      smtp.sendMessage("message", "a@example.com", "ok@example.com", "bad@example.com"),
    ).rejects.toBeInstanceOf(SMTPFatalError);
    expect(delivered).toBe(false);
  });
});
