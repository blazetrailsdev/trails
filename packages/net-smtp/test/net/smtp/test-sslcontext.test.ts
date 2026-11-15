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
const CA_PATH = decodeURIComponent(new URL("../fixtures/cacert.pem", import.meta.url).pathname);
const SERVER_KEY = fixtures["../fixtures/server.key"];
const SERVER_CERT = fixtures["../fixtures/server.crt"];

type SSLContext = InstanceType<typeof OpenSSL.SSL.SSLContext>;
type SSLSocket = ReturnType<SMTP["sslSocket"]>;

class MySMTP extends SMTP {
  __sslContext: SSLContext | null = null;
  __sslSocket: SSLSocket | null = null;

  constructor(port: number, kw: Record<string, unknown> = {}) {
    super("localhost", port, kw);
  }

  protected override sslSocket(
    socket: Parameters<SMTP["sslSocket"]>[0],
    context: SSLContext,
  ): SSLSocket {
    this.__sslContext = context;
    return (this.__sslSocket = super.sslSocket(socket, context));
  }
}

let serverSocket: Server | null = null;
const clientSockets: Socket[] = [];

async function defaultSslContext(): Promise<SSLContext> {
  const store = new OpenSSL.X509.Store();
  await store.addFile(CA_PATH);
  return SMTP.defaultSslContext({ certStore: store });
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
    const started = smtp.start();
    await expect(started).rejects.toThrow(OpenSSL.SSL.SSLError);
    await started.catch(() => {});
    expect(smtp.__sslSocket!.verifyResult).toEqual(OpenSSL.X509.V_ERR_SELF_SIGNED_CERT_IN_CHAIN);
    expect(smtp.__sslContext!.verifyMode).toEqual(OpenSSL.SSL.VERIFY_PEER);
  });

  it("starttls close socket on verify failure", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    await expect(smtp.start()).rejects.toThrow(OpenSSL.SSL.SSLError);
    expect(smtp.__sslSocket!.isClosed()).toEqual(true);
  });

  it("enable tls", async () => {
    const smtp = new MySMTP(await startSmtpdSmtps());
    const context = await defaultSslContext();
    smtp.enableTls(context);
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable tls before disable starttls", async () => {
    const smtp = new MySMTP(await startSmtpdSmtps());
    const context = await defaultSslContext();
    smtp.enableTls(context);
    smtp.disableStarttls();
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable starttls", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = await defaultSslContext();
    smtp.enableStarttls(context);
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("enable starttls before disable tls", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = await defaultSslContext();
    smtp.enableStarttls(context);
    smtp.disableTls();
    await smtp.start();
    expect(smtp.__sslContext).toEqual(context);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("start with tls verify true", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: true });
    const started = smtp.start();
    await expect(started).rejects.toThrow(OpenSSL.SSL.SSLError);
    await started.catch(() => {});
    expect(smtp.__sslSocket!.verifyResult).toEqual(OpenSSL.X509.V_ERR_SELF_SIGNED_CERT_IN_CHAIN);
    expect(smtp.__sslContext!.verifyMode).toEqual(OpenSSL.SSL.VERIFY_PEER);
  });

  it("start with tls verify false", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: false });
    await smtp.start();
    expect(smtp.__sslContext!.verifyMode).toEqual(OpenSSL.SSL.VERIFY_NONE);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("tls verify true after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: false });
    smtp.tlsVerify = true;
    const started = smtp.start();
    await expect(started).rejects.toThrow(OpenSSL.SSL.SSLError);
    await started.catch(() => {});
    expect(smtp.__sslSocket!.verifyResult).toEqual(OpenSSL.X509.V_ERR_SELF_SIGNED_CERT_IN_CHAIN);
    expect(smtp.__sslContext!.verifyMode).toEqual(OpenSSL.SSL.VERIFY_PEER);
  });

  it("tls verify false after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsVerify: true });
    smtp.tlsVerify = false;
    await smtp.start();
    expect(smtp.__sslContext!.verifyMode).toEqual(OpenSSL.SSL.VERIFY_NONE);
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("start with tls hostname", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), { tlsHostname: "unexpected.example.com" });
    const context = await defaultSslContext();
    smtp.enableStarttls(context);
    await expect(smtp.start()).rejects.toThrow(OpenSSL.SSL.SSLError);
    expect(smtp.__sslSocket!.hostname).toEqual("unexpected.example.com");
  });

  it("start without tls hostname", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    const context = await defaultSslContext();
    smtp.enableStarttls(context);
    await smtp.start();
    expect(smtp.__sslSocket!.hostname).toEqual("localhost");
    expect((await smtp.rset()).isSuccess()).toEqual(true);
  });

  it("tls hostname after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    smtp.tlsHostname = "unexpected.example.com";
    const context = await defaultSslContext();
    smtp.enableStarttls(context);
    await expect(smtp.start()).rejects.toThrow(OpenSSL.SSL.SSLError);
    expect(smtp.__sslSocket!.hostname).toEqual("unexpected.example.com");
  });

  it("start with ssl context params", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls(), {
      sslContextParams: { timeout: 123, verifyMode: OpenSSL.SSL.VERIFY_NONE },
    });
    await smtp.start();
    expect(smtp.__sslContext!.timeout).toEqual(123);
  });

  it("ssl context params after initialize", async () => {
    const smtp = new MySMTP(await startSmtpdStarttls());
    smtp.sslContextParams = { timeout: 123, verifyMode: OpenSSL.SSL.VERIFY_NONE };
    await smtp.start();
    expect(smtp.__sslContext!.timeout).toEqual(123);
  });
});
