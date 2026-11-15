import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SMTP, SMTPUnsupportedCommand } from "../../../lib/smtp.js";

class MySMTP extends SMTP {
  constructor(port: number) {
    super("localhost", port);
  }
}
Object.assign(MySMTP.prototype, { async tlsconnect() {} });

let serverSocket: Server | null = null;
const clientSockets: Socket[] = [];
let starttlsExecuted = false;

async function startSmtpd(starttls: boolean): Promise<number> {
  starttlsExecuted = false;
  serverSocket = createServer((s) => {
    clientSockets.push(s);
    s.on("error", () => {});
    s.write("220 fakeserver\r\n");
    let buffer = "";
    s.on("data", (chunk) => {
      buffer += chunk.toString();
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const cmd = buffer.slice(0, i).replace(/\r$/, "");
        buffer = buffer.slice(i + 1);
        if (cmd.startsWith("EHLO ")) {
          s.write("250-fakeserver\r\n");
          if (starttls) s.write("250-STARTTLS\r\n");
          s.write("250 8BITMIME\r\n");
        } else if (cmd.startsWith("STARTTLS")) {
          starttlsExecuted = true;
          s.write("220 2.0.0 Ready to start TLS\r\n");
        } else {
          throw new Error(`unsupported command: ${cmd}`);
        }
      }
    });
  });
  await new Promise<void>((resolve) => serverSocket!.listen(0, "localhost", () => resolve()));
  return (serverSocket.address() as { port: number }).port;
}

describe("TestStarttls", () => {
  afterEach(async () => {
    for (const s of clientSockets.splice(0)) s.destroy();
    await new Promise<void>((resolve) =>
      serverSocket ? serverSocket.close(() => resolve()) : resolve(),
    );
    serverSocket = null;
  });

  it("default with starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    await smtp.start();
    expect(starttlsExecuted).toBeTruthy();
  });

  it("default without starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(false));
    await smtp.start();
    expect(!starttlsExecuted).toBeTruthy();
  });

  it("enable starttls with starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableStarttls();
    await smtp.start();
    expect(starttlsExecuted).toBeTruthy();
  });

  it("enable starttls without starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(false));
    smtp.enableStarttls();
    const err = (await smtp.start().catch((e: unknown) => e)) as SMTPUnsupportedCommand;
    expect(err).toBeInstanceOf(SMTPUnsupportedCommand);
    expect(err.message).toEqual("STARTTLS is not supported on this server");
    expect(err.response).toBeNull();
  });

  it("enable starttls auto with starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableStarttlsAuto();
    await smtp.start();
    expect(starttlsExecuted).toBeTruthy();
  });

  it("tls with starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableTls();
    await smtp.start();
    expect(!starttlsExecuted).toBeTruthy();
  });

  it("tls without starttls capable", async () => {
    const smtp = new MySMTP(await startSmtpd(false));
    smtp.enableTls();
  });

  it("disable starttls", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.disableStarttls();
    await smtp.start();
    expect(!starttlsExecuted).toBeTruthy();
  });

  it("enable tls and enable starttls", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableTls();
    let err: Error | undefined;
    expect(() => {
      try {
        smtp.enableStarttls();
      } catch (e) {
        err = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(err!.message).toEqual("SMTPS and STARTTLS is exclusive");
  });

  it("enable tls and enable starttls auto", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableTls();
    let err: Error | undefined;
    expect(() => {
      try {
        smtp.enableStarttlsAuto();
      } catch (e) {
        err = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(err!.message).toEqual("SMTPS and STARTTLS is exclusive");
  });

  it("enable starttls and enable starttls auto", async () => {
    const smtp = new MySMTP(await startSmtpd(true));
    smtp.enableStarttls();
    expect(() => smtp.enableStarttlsAuto()).not.toThrow();
  });
});
