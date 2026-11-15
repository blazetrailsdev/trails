import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { OpenSSL } from "@blazetrails/ruby-compat";
import { SMTP } from "../../../lib/smtp.js";

// @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
const fixtures: Record<string, string> = import.meta.glob("../fixtures/*.{pem,crt,key}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const CA_FILE = fixtures["../fixtures/cacert.pem"];
const SERVER_KEY = fixtures["../fixtures/server.key"];
const SERVER_CERT = fixtures["../fixtures/server.crt"];

type SslContext = Record<string, unknown>;
type Connection = { options: { tls?: { servername?: string } }; _socket?: Socket };

const tlsconnect = (
  SMTP.prototype as unknown as {
    tlsconnect(s: Connection, context: SslContext | null): Promise<void>;
  }
).tlsconnect;

class MySMTP extends SMTP {
  __sslContext: SslContext | null = null;
  __sslSocket: Connection | null = null;

  constructor(port: number, kw: Record<string, unknown> = {}) {
    super("localhost", port, kw);
  }
}
Object.assign(MySMTP.prototype, {
  async tlsconnect(this: MySMTP, s: Connection, context: SslContext | null) {
    this.__sslContext = context;
    this.__sslSocket = s;
    return tlsconnect.call(this, s, context);
  },
});

let serverSocket: Server | null = null;
const clientSockets: Socket[] = [];

function defaultSslContext(): SslContext {
  return SMTP.defaultSslContext({ ca: [CA_FILE] });
}

async function wrapSslSocket(sock: Socket): Promise<Socket | null> {
  sock.removeAllListeners("data");
  const s = new TLSSocket(sock, {
    isServer: true,
    key: SERVER_KEY,
    cert: SERVER_CERT + CA_FILE,
  });
  clientSockets.push(s);
  s.on("error", () => {});
  const accepted = await new Promise<boolean>((resolve) => {
    s.once("secure", () => resolve(true));
    s.once("error", () => resolve(false));
    s.once("close", () => resolve(false));
  });
  return accepted ? s : null;
}

function serve(s: Socket, handle: (s: Socket, cmd: string) => Promise<Socket | null | void>) {
  let buffer = "";
  let queue = Promise.resolve();
  s.on("data", (chunk) => {
    buffer += chunk.toString();
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const cmd = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      queue = queue.then(async () => {
        const next = await handle(s, cmd);
        if (next) serve(next, handle);
      });
    }
  });
}

async function listen(onConnection: (s: Socket) => void): Promise<number> {
  serverSocket = createServer((s) => {
    clientSockets.push(s);
    s.on("error", () => {});
    onConnection(s);
  });
  await new Promise<void>((resolve) => serverSocket!.listen(0, "localhost", () => resolve()));
  return (serverSocket.address() as { port: number }).port;
}

function startSmtpdStarttls(): Promise<number> {
  return listen((s) => {
    s.write("220 fakeserver\r\n");
    serve(s, async (s, cmd) => {
      if (cmd.startsWith("EHLO ")) {
        s.write("250-fakeserver\r\n");
        s.write("250-STARTTLS\r\n");
        s.write("250 8BITMIME\r\n");
      } else if (cmd.startsWith("RSET")) {
        s.write("250 OK\r\n");
      } else if (cmd.startsWith("STARTTLS")) {
        s.write("220 2.0.0 Ready to start TLS\r\n");
        return wrapSslSocket(s);
      } else {
        throw new Error(`unsupported command: ${cmd}`);
      }
    });
  });
}

function startSmtpdSmtps(): Promise<number> {
  return listen(async (sock) => {
    const s = await wrapSslSocket(sock);
    if (!s) return;
    s.write("220 fakeserver\r\n");
    serve(s, async (s, cmd) => {
      if (cmd.startsWith("EHLO ")) {
        s.write("250-fakeserver\r\n");
        s.write("250 8BITMIME\r\n");
      } else if (cmd.startsWith("RSET")) {
        s.write("250 OK\r\n");
      } else {
        throw new Error(`unsupported command: ${cmd}`);
      }
    });
  });
}

async function startError(smtp: SMTP): Promise<{ code?: string }> {
  const err = await smtp.start().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(OpenSSL.SSL.SSLError);
  return err as { code?: string };
}

describe("TestSSLContext", () => {
  afterEach(async () => {
    for (const s of clientSockets.splice(0)) s.destroy();
    await new Promise<void>((resolve) =>
      serverSocket ? serverSocket.close(() => resolve()) : resolve(),
    );
    serverSocket = null;
  });

  it("default", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const err = await startError(smtp);
    expect(err.code).toEqual("SELF_SIGNED_CERT_IN_CHAIN");
    expect(smtp.__sslContext!["verifyMode"]).toEqual("VERIFY_PEER");
  });

  it("starttls close socket on verify failure", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    await startError(smtp);
    expect(smtp.__sslSocket!._socket!.destroyed).toEqual(true);
  });

  it("enable tls", async () => {
    const smtp = new MySMTP(await startSmtpdSmtps());
    const context = defaultSslContext();
    smtp.enableTls(context);
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable tls before disable starttls", async () => {
    const smtp = new MySMTP(await startSmtpdSmtps());
    const context = defaultSslContext();
    smtp.enableTls(context);
    smtp.disableStarttls();
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable starttls", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = defaultSslContext();
    smtp.enableStarttls(context);
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable starttls before disable tls", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = defaultSslContext();
    smtp.enableStarttls(context);
    smtp.disableTls();
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("start with tls verify true", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: true });
    const err = await startError(smtp);
    expect(err.code).toEqual("SELF_SIGNED_CERT_IN_CHAIN");
    expect(smtp.__sslContext!["verifyMode"]).toEqual("VERIFY_PEER");
  });

  it("start with tls verify false", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: false });
    await smtp.start();
    expect(smtp.__sslContext!["verifyMode"]).toEqual("VERIFY_NONE");
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("tls verify true after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: false });
    smtp.tlsVerify = true;
    const err = await startError(smtp);
    expect(err.code).toEqual("SELF_SIGNED_CERT_IN_CHAIN");
    expect(smtp.__sslContext!["verifyMode"]).toEqual("VERIFY_PEER");
  });

  it("tls verify false after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: true });
    smtp.tlsVerify = false;
    await smtp.start();
    expect(smtp.__sslContext!["verifyMode"]).toEqual("VERIFY_NONE");
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("start with tls hostname", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsHostname: "unexpected.example.com" });
    const context = defaultSslContext();
    smtp.enableStarttls(context);
    await startError(smtp);
    expect(smtp.__sslSocket!.options.tls!.servername).toEqual("unexpected.example.com");
  });

  it("start without tls hostname", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = defaultSslContext();
    smtp.enableStarttls(context);
    await smtp.start();
    expect(smtp.__sslSocket!.options.tls!.servername).toEqual("localhost");
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("tls hostname after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    smtp.tlsHostname = "unexpected.example.com";
    const context = defaultSslContext();
    smtp.enableStarttls(context);
    await startError(smtp);
    expect(smtp.__sslSocket!.options.tls!.servername).toEqual("unexpected.example.com");
  });

  it("start with ssl context params", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), {
      sslContextParams: { timeout: 123, verifyMode: "VERIFY_NONE" },
    });
    await smtp.start();
    expect(smtp.__sslContext!["timeout"]).toEqual(123);
  });

  it("ssl context params after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    smtp.sslContextParams = { timeout: 123, verifyMode: "VERIFY_NONE" };
    await smtp.start();
    expect(smtp.__sslContext!["timeout"]).toEqual(123);
  });
});
