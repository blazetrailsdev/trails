import { afterEach, describe, expect, it } from "vitest";
import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import { createServer } from "node:net";
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

  it("nodemailer's private members the session drives still exist", () => {
    const connection = new SMTPConnection({}) as unknown as Record<string, unknown>;
    for (const name of ["_sendCommand", "_actionGreeting", "_clearPhase", "_upgradeConnection"]) {
      expect(typeof connection[name], name).toBe("function");
    }
    expect(Array.isArray(connection._responseActions)).toBe(true);
    expect(connection._destroyed).toBe(false);
    expect("_socket" in connection).toBe(true);
  });

  it("open message stream writes through data's block", async () => {
    let body = "";
    const port = await fakeServerStart({
      onData(stream, _session, callback) {
        stream.on("data", (chunk) => (body += String(chunk)));
        stream.on("end", () => callback());
      },
    });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    const res = await smtp.ready(
      "a@example.com",
      ["b@example.com"],
      (f: { write(str: string): unknown }) => f.write("hello"),
    );
    expect(res.isSuccess()).toBe(true);
    expect(body).toContain("hello");
  });

  it("falls back to helo when ehlo is refused", async () => {
    const lines: string[] = [];
    const server = createServer((socket) => {
      socket.write("220 ready\r\n");
      socket.on("data", (chunk) => {
        const line = String(chunk).trim();
        lines.push(line);
        socket.write(line.startsWith("EHLO") ? "502 no\r\n" : "250 ok\r\n");
      });
      socket.on("error", () => {});
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const smtp = new SMTP("127.0.0.1", (server.address() as { port: number }).port);
    await smtp.start();
    expect(smtp.isEsmtp()).toBe(false);
    expect(lines).toEqual(["EHLO localhost", "HELO localhost"]);
    await smtp.finish();
    await new Promise((resolve) => server.close(resolve));
  });

  it("auth cram md5 answers the challenge", async () => {
    const port = await fakeServerStart({
      disabledCommands: ["STARTTLS"],
      authOptional: true,
      authMethods: ["CRAM-MD5"],
      onAuth(auth, _session, callback) {
        const ok = auth.validatePassword?.("password");
        callback(ok ? null : new Error("no"), ok ? { user: auth.username } : undefined);
      },
    });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    expect((await smtp.authenticate("account", "password", "cram_md5")).isSuccess()).toBe(true);
  });

  it("a 5xx reply to a continue step raises its exception class", async () => {
    const server = createServer((sock) => {
      sock.write("220 ready\r\n");
      sock.on("data", (chunk) => {
        sock.write(chunk.toString().startsWith("EHLO") ? "250 ok\r\n" : "554 refused\r\n");
      });
      sock.on("error", () => {});
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as { port: number };
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    const err = await smtp.authenticate("account", "password", "login").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPFatalError);
    await smtp.finish().catch(() => {});
    server.close();
    server.unref();
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
