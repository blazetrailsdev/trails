import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { ArgumentError, EOFError, block } from "@blazetrails/ruby-compat";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { OpenTimeout } from "./protocol.js";
import {
  Address,
  Response,
  SMTP,
  SMTPAuthenticationError,
  SMTPFatalError,
  SMTPServerBusy,
  SMTPSyntaxError,
  SMTPUnknownError,
  SMTPUnsupportedCommand,
} from "./smtp.js";

type Capabilities = Record<string, boolean | string | string[] | null | undefined>;

class FakeServer {
  private static _servers: FakeServer[] = [];

  static async start(capabilities: Capabilities = {}): Promise<FakeServer> {
    const server = new this();
    await server.start(capabilities);
    return server;
  }

  static async stopAll(): Promise<void> {
    for (const s of FakeServer._servers.splice(0)) await s.stop();
  }

  port = 0;
  commands: string[] = [];
  body = "";
  sock!: Socket;
  capa: Capabilities = {};
  private _starttlsStarted = false;
  private _tls: unknown;
  private _server: Server | null = null;
  private _sockets: Socket[] = [];
  private _buffer = "";
  private _waiter: ((line: string | null) => void) | null = null;
  private _eof = false;

  isStarttlsStarted(): boolean {
    return this._starttlsStarted;
  }

  async start(capabilities: Capabilities = {}): Promise<void> {
    FakeServer._servers.push(this);
    this.commands = [];
    this.body = "";
    const { tls, ...capa } = capabilities;
    this.capa = capa;
    this._tls = tls;
    this._server = createServer((s) => {
      this.sock = s;
      this._sockets.push(s);
      s.on("error", () => {});
      void this.init().then(() => this.loop());
    });
    await new Promise<void>((resolve) => this._server!.listen(0, "127.0.0.1", () => resolve()));
    this.port = (this._server.address() as { port: number }).port;
  }

  async stop(): Promise<void> {
    for (const s of this._sockets) s.destroy();
    await new Promise<void>((resolve) => this._server!.close(() => resolve()));
  }

  async init(): Promise<void> {
    if (this._tls) {
      await this.sslSocket();
    } else {
      this.read(this.sock);
    }
    await this.greeting();
  }

  private async sslSocket(): Promise<void> {
    const { secureContext } = new SMTPServer({ logger: false });
    const s = new TLSSocket(this.sock, {
      isServer: true,
      secureContext: secureContext.get("*"),
    });
    await new Promise((resolve) => s.once("secure", resolve));
    s.on("error", () => {});
    this.sock = s;
    this._sockets.push(s);
    this.read(s);
  }

  private read(s: Socket): void {
    s.on("data", (chunk) => {
      this._buffer += chunk.toString();
      this.flush();
    });
    s.on("end", () => {
      this._eof = true;
      this.flush();
    });
  }

  private flush(): void {
    if (this._waiter == null) return;
    const i = this._buffer.indexOf("\n");
    if (i < 0 && !this._eof) return;
    const waiter = this._waiter;
    this._waiter = null;
    if (i < 0) return waiter(null);
    const line = this._buffer.slice(0, i + 1);
    this._buffer = this._buffer.slice(i + 1);
    waiter(line);
  }

  gets(): Promise<string | null> {
    return new Promise((resolve) => {
      this._waiter = resolve;
      this.flush();
    });
  }

  async greeting(): Promise<void> {
    this.sock.write("220 ready\r\n");
  }

  async ehlo(_: string): Promise<void> {
    const res = ["220-servername\r\n"];
    for (const [k, v] of Object.entries(this.capa)) {
      if (v == null || v === false) continue;
      if (v === true) res.push(`220-${k.toUpperCase()}\r\n`);
      else if (typeof v === "string") res.push(`220-${k.toUpperCase()} ${v.toUpperCase()}\r\n`);
      else res.push(`220-${k.toUpperCase()} ${v.map((x) => x.toUpperCase()).join(" ")}\r\n`);
    }
    res[res.length - 1] = res.at(-1)!.replace(/^220-/, "220 ");
    this.sock.write(res.join(""));
  }

  async starttls(): Promise<void> {
    if (!this.capa["starttls"]) {
      this.sock.write("502 5.5.1 Error: command not implemented\r\n");
      return;
    }
    this.sock.write("220 2.0.0 Ready to start TLS\r\n");
    this.sock.removeAllListeners("data");
    this.sock.removeAllListeners("end");
    await this.sslSocket();
    this._starttlsStarted = true;
  }

  async auth(...args: string[]): Promise<void> {
    if (!this.capa["auth"]) {
      this.sock.write("503 5.5.1 Error: authentication not enabled\r\n");
      return;
    }
    const [type, arg] = args;
    if (![this.capa["auth"]].flat().some((a) => String(a).toUpperCase() === type.toUpperCase())) {
      this.sock.write("535 5.7.8 Error: authentication failed: no mechanism available\r\n");
      return;
    }
    let result = false;
    switch (type) {
      case "PLAIN":
        result = arg === "AGFjY291bnQAcGFzc3dvcmQ=";
        break;
      case "LOGIN": {
        this.sock.write("334 VXNlcm5hbWU6\r\n");
        const u = atob((await this.gets())!.trim());
        this.sock.write("334 UGFzc3dvcmQ6\r\n");
        const p = atob((await this.gets())!.trim());
        result = u === "account" && p === "password";
        break;
      }
      case "CRAM-MD5": {
        this.sock.write("334 PDEyMzQ1Njc4OTAuMTIzNDVAc2VydmVybmFtZT4=\r\n");
        const r = (await this.gets())?.trim();
        result = r === "YWNjb3VudCAyYzBjMTgxZjkxOGU2ZGM5Mjg3Zjk3N2E1ODhiMzg1YQ==";
        break;
      }
      case "XOAUTH2":
        result = arg === "dXNlcj1hY2NvdW50AWF1dGg9QmVhcmVyIHRva2VuAQE=";
        break;
    }
    if (result) {
      this.sock.write("235 2.7.0 Authentication successful\r\n");
    } else {
      this.sock.write("535 5.7.8 Error: authentication failed: authentication failure\r\n");
    }
  }

  async mail(_: string): Promise<void> {
    this.sock.write("250 2.1.0 Ok\r\n");
  }

  async rcpt(_: string): Promise<void> {
    this.sock.write("250 2.1.0 Ok\r\n");
  }

  async data(): Promise<void> {
    this.sock.write("354 End data with <CR><LF>.<CR><LF>\r\n");
    for (let l = await this.gets(); l != null; l = await this.gets()) {
      if (l.trimEnd() === ".") break;
      this.body += l.replace(/^\./, "");
    }
    this.sock.write("250 2.0.0 Ok: queued as ABCDEFG\r\n");
  }

  async rset(): Promise<void> {
    this.sock.write("250 2.0.0 Ok\r\n");
  }

  async quit(): Promise<void> {
    this.sock.write("221 2.0.0 Bye\r\n");
    this.sock.end();
  }

  async loop(): Promise<void> {
    for (let comm = await this.gets(); comm != null; comm = await this.gets()) {
      this.commands.push(comm);
      const line = comm.trimEnd();
      if (line.startsWith("EHLO ")) await this.ehlo(line.split(" ")[1]);
      else if (line === "STARTTLS") await this.starttls();
      else if (line.startsWith("AUTH ")) await this.auth(...line.slice(5).split(" "));
      else if (line.startsWith("MAIL FROM:")) await this.mail(line.slice(10));
      else if (line.startsWith("RCPT TO:")) await this.rcpt(line.slice(8));
      else if (line === "DATA") await this.data();
      else if (line === "RSET") await this.rset();
      else if (line === "QUIT") {
        await this.quit();
        break;
      } else this.sock.write("502 5.5.2 Error: command not recognized\r\n");
    }
  }
}

const servers: SMTPServer[] = [];
const noop = block(() => {});

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

function greeting(line: string): Promise<number> {
  const [code, ...rest] = line.split(" ");
  return fakeServerStart({
    onConnect(_session, callback) {
      callback(Object.assign(new Error(rest.join(" ")), { responseCode: Number(code) }));
    },
  });
}

async function refusedAt(line: string, klass: new (...args: never[]) => Error): Promise<void> {
  const port = await greeting(line);
  const err = await SMTP.start("127.0.0.1", port).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(klass);
  expect((err as Error).message).toBe(`${line}\n`);
  expect((err as { response: Response }).response.status).toBe(line.slice(0, 3));
}

const auth = { disabledCommands: ["STARTTLS"], authOptional: true };

describe("TestSMTP", () => {
  afterEach(async () => {
    await FakeServer.stopAll();
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  it("critical", async () => {
    const smtp = new SMTP("localhost", 25);
    await expect(
      smtp.critical(() => {
        throw new Error("fail on purpose");
      }),
    ).rejects.toThrow("fail on purpose");
    expect(await smtp.critical()).toBeInstanceOf(Response);
  });

  it("esmtp", () => {
    const smtp = new SMTP("localhost", 25);
    expect(smtp.esmtp).toBe(true);
    expect(smtp.isEsmtp()).toBe(true);
    smtp.esmtp = "omg";
    expect(smtp.esmtp).toBe("omg");
    expect(smtp.isEsmtp()).toBe("omg");
  });

  it("server capabilities", async () => {
    const port = await fakeServerStart({
      disabledCommands: [],
      authMethods: ["PLAIN"],
      allowInsecureAuth: true,
    });
    const smtp = (await SMTP.start("127.0.0.1", port, { starttls: false })) as SMTP;
    expect(smtp.capabilities).toEqual({ STARTTLS: [], AUTH: ["PLAIN"] });
    expect(smtp.isCapable("STARTTLS")).toBe(true);
    expect(smtp.isCapable("DOES-NOT-EXIST")).toBe(false);
    await smtp.finish();
  });

  it("address", () => {
    const a = new Address("foo@example.com", "p0=123", { p1: 456 }, { p2: null, p3: "789" });
    expect(a.address).toBe("foo@example.com");
    expect(a.parameters).toEqual(["p0=123", "p1=456", "p2", "p3=789"]);
  });

  it("auth plain", async () => {
    const server = await FakeServer.start({ auth: "plain" });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    expect((await smtp.authenticate("account", "password", "plain")).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe("AUTH PLAIN AGFjY291bnQAcGFzc3dvcmQ=\r\n");
  });

  it("unsuccessful auth plain", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    const err = await smtp.authenticate("foo", "bar", "plain").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPAuthenticationError);
    expect((err as SMTPAuthenticationError).response!.status).toBe("535");
  });

  it("auth login", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["LOGIN"] });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    expect((await smtp.authenticate("account", "password", "login")).isSuccess()).toBe(true);
  });

  it("unsuccessful auth login", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["LOGIN"] });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    const err = await smtp.authenticate("foo", "bar", "login").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPAuthenticationError);
    expect((err as SMTPAuthenticationError).response!.status).toBe("535");
  });

  it("auth xoauth2", async () => {
    const server = await FakeServer.start({ auth: "xoauth2" });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    expect((await smtp.authenticate("account", "token", "xoauth2")).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe(
      "AUTH XOAUTH2 dXNlcj1hY2NvdW50AWF1dGg9QmVhcmVyIHRva2VuAQE=\r\n",
    );
  });

  it("send message", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    const res = await smtp.sendMessage("message", "sender@example.com", "rcpt1@example.com");
    expect(res.isSuccess()).toBe(true);
  });

  it("send message with multiple recipients", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    await smtp.sendMessage(
      "message",
      "sender@example.com",
      "rcpt1@example.com",
      "rcpt2@example.com",
    );
  });

  it("send message with multiple recipients as array", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    await smtp.sendMessage("message", "sender@example.com", [
      "rcpt1@example.com",
      "rcpt2@example.com",
    ]);
  });

  it("unsuccessful send message server busy", () => refusedAt("400 BUSY", SMTPServerBusy));
  it("unsuccessful send message syntax error", () =>
    refusedAt("502 SYNTAX ERROR", SMTPSyntaxError));
  it("unsuccessful send message authentication error", () =>
    refusedAt("530 AUTH ERROR", SMTPAuthenticationError));
  it("unsuccessful send message fatal error", () => refusedAt("520 FATAL ERROR", SMTPFatalError));
  it("unsuccessful send message unknown error", () => refusedAt("300 UNKNOWN", SMTPUnknownError));

  it("rset", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    expect((await smtp.rset()).isSuccess()).toBe(true);
    await smtp.finish();
  });

  it("mailfrom", async () => {
    const server = await FakeServer.start();
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    expect((await smtp.mailfrom("foo@example.com")).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe("MAIL FROM:<foo@example.com>\r\n");
    await smtp.finish();
  });

  it("rcptto", async () => {
    const server = await FakeServer.start();
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    expect((await smtp.rcptto("foo@example.com")).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe("RCPT TO:<foo@example.com>\r\n");
    await smtp.finish();
  });

  it("crlf injection", async () => {
    const smtp = new SMTP("localhost", 25);
    await expect(smtp.mailfrom("foo\r\nbar")).rejects.toBeInstanceOf(ArgumentError);
    await expect(smtp.mailfrom("foo\rbar")).rejects.toBeInstanceOf(ArgumentError);
    await expect(smtp.mailfrom("foo\nbar")).rejects.toBeInstanceOf(ArgumentError);
    await expect(smtp.rcptto("foo\r\nbar")).rejects.toBeInstanceOf(ArgumentError);
  });

  it("start with tls", async () => {
    await SMTP.start("127.0.0.1", await fakeServerStart({ secure: true }), {
      tls: true,
      tlsVerify: false,
    }).then((s) => (s as SMTP).finish());
    await SMTP.start("127.0.0.1", await fakeServerStart(), { tls: false }).then((s) =>
      (s as SMTP).finish(),
    );
  });

  it("start with starttls always", async () => {
    const port = await fakeServerStart({ disabledCommands: ["AUTH"] });
    const smtp = (await SMTP.start("127.0.0.1", port, {
      starttls: "always",
      tlsVerify: false,
    })) as SMTP;
    await smtp.finish();
    const refused = SMTP.start("127.0.0.1", await fakeServerStart(), { starttls: "always" });
    await expect(refused).rejects.toBeInstanceOf(SMTPUnsupportedCommand);
  });

  it("start instance", async () => {
    const smtp = new SMTP("127.0.0.1", await fakeServerStart());
    await smtp.start();
    expect(smtp.isStarted()).toBe(true);
    await smtp.finish();
  });

  it("start instance with position argument", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = new SMTP("127.0.0.1", port);
    await smtp.start("myname", "account", "password", "plain");
    await smtp.finish();
  });

  it("start instance with keyword argument", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = new SMTP("127.0.0.1", port);
    await smtp.start({ helo: "myname", user: "account", secret: "password", authtype: "plain" });
    await smtp.finish();
  });

  it("start instance password is secret", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = new SMTP("127.0.0.1", port);
    await smtp.start({ helo: "myname", user: "account", password: "password", authtype: "plain" });
    await smtp.finish();
  });

  it("with tls", async () => {
    const port = await fakeServerStart({ secure: true });
    const smtp = new SMTP("127.0.0.1", port, { tls: true, tlsVerify: false });
    await smtp.start(noop);
  });

  it("with starttls always", async () => {
    let port = await fakeServerStart({ disabledCommands: ["AUTH"] });
    await new SMTP("127.0.0.1", port, { starttls: "always", tlsVerify: false }).start(noop);
    port = await fakeServerStart();
    const smtp = new SMTP("127.0.0.1", port, { starttls: "always", tlsVerify: false });
    await expect(smtp.start(noop)).rejects.toBeInstanceOf(SMTPUnsupportedCommand);
  });

  it("with starttls false", async () => {
    const port = await fakeServerStart({ disabledCommands: ["AUTH"] });
    const smtp = new SMTP("127.0.0.1", port, { starttls: false, tlsVerify: false });
    await smtp.start(noop);
  });

  it("start", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    await smtp.finish();
  });

  it("start with position argument", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = await SMTP.start("127.0.0.1", port, "myname", "account", "password", "plain");
    await (smtp as SMTP).finish();
  });

  it("start with keyword argument", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = await SMTP.start("127.0.0.1", port, {
      helo: "myname",
      user: "account",
      secret: "password",
      authtype: "plain",
    });
    await (smtp as SMTP).finish();
  });

  it("start password is secret", async () => {
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = await SMTP.start("127.0.0.1", port, {
      helo: "myname",
      user: "account",
      password: "password",
      authtype: "plain",
    });
    await (smtp as SMTP).finish();
  });

  it("start invalid number of arguments", async () => {
    const err = await SMTP.start(
      "localhost",
      25,
      "myname",
      "account",
      "password",
      "plain",
      "invalid_arg",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArgumentError);
    expect((err as Error).message).toBe("wrong number of arguments (given 7, expected 1..6)");
  });

  it("start instance invalid number of arguments", async () => {
    const smtp = new SMTP("localhost");
    const err = await smtp
      .start("myname", "account", "password", "plain", "invalid_arg")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArgumentError);
    expect((err as Error).message).toBe("wrong number of arguments (given 5, expected 0..4)");
  });

  it("mailfrom with address", async () => {
    const server = await FakeServer.start();
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const addr = new Address("foo@example.com", { size: 12345 });
    expect((await smtp.mailfrom(addr)).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe("MAIL FROM:<foo@example.com> size=12345\r\n");
  });

  it("rcptto with address", async () => {
    const server = await FakeServer.start();
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const addr = new Address("foo@example.com", { nofty: "failure" });
    expect((await smtp.rcptto(addr)).isSuccess()).toBe(true);
    expect(server.commands.at(-1)).toBe("RCPT TO:<foo@example.com> nofty=failure\r\n");
  });

  it("non continue auth login", async () => {
    const server = await FakeServer.start({ auth: "login" });
    server.auth = async function () {
      this.sock.write("334 VXNlcm5hbWU6\r\n");
      await this.gets();
      this.sock.write("235 2.7.0 Authentication successful\r\n");
    };
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const err = await smtp.authenticate("account", "password", "login").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPUnknownError);
    expect((err as SMTPUnknownError).message).toBe("235 2.7.0 Authentication successful\n");
    expect((err as SMTPUnknownError).response!.status).toBe("235");
  });

  it("unsuccessful auth xoauth2", async () => {
    const server = await FakeServer.start({ auth: "xoauth2" });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const err = await smtp.authenticate("account", "password", "xoauth2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPAuthenticationError);
    expect((err as SMTPAuthenticationError).message).toBe(
      "535 5.7.8 Error: authentication failed: authentication failure\n",
    );
    expect((err as SMTPAuthenticationError).response!.status).toBe("535");
  });

  it("unsuccessful data", async () => {
    const server = new FakeServer();
    server.data = async function () {
      this.sock.write("250 OK\r\n");
    };
    await server.start();
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const err = await smtp.data("message").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMTPUnknownError);
    expect((err as SMTPUnknownError).message).toBe("could not get 3xx (250: 250 OK\n)");
    expect((err as SMTPUnknownError).response!.status).toBe("250");
  });

  it("tls connect", async () => {
    const server = await FakeServer.start({ tls: true });
    const smtp = new SMTP("127.0.0.1", server.port, { tlsVerify: false });
    smtp.enableTls();
    smtp.openTimeout = 1;
    await smtp.start(noop);
  });

  it("tls connect timeout", async () => {
    const server = new FakeServer();
    server.init = () => new Promise(() => {});
    await server.start({ tls: true });
    const smtp = new SMTP("127.0.0.1", server.port);
    smtp.enableTls();
    smtp.openTimeout = 0.1;
    await expect(smtp.start(noop)).rejects.toBeInstanceOf(OpenTimeout);
  });

  it("eof error backtrace", async () => {
    const server = new FakeServer();
    server.ehlo = async function () {
      this.sock.end();
    };
    await server.start();
    const smtp = new SMTP("127.0.0.1", server.port);
    const e = await smtp.start(noop).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(EOFError);
    expect((e as Error).stack).toMatch(/\bsmtp\.ts:/);
  });

  it("with starttls auto", async () => {
    let server = await FakeServer.start({ starttls: true });
    let smtp = new SMTP("127.0.0.1", server.port, { starttls: "auto", tlsVerify: false });
    await smtp.start(noop);
    expect(server.isStarttlsStarted()).toBe(true);

    server = await FakeServer.start({ starttls: false });
    smtp = new SMTP("127.0.0.1", server.port, { starttls: "auto", tlsVerify: false });
    await smtp.start(noop);
    expect(server.isStarttlsStarted()).toBe(false);
  });

  it("start with starttls auto", async () => {
    let server = await FakeServer.start({ starttls: true });
    const options = { starttls: "auto", tlsVerify: false };
    await SMTP.start("127.0.0.1", server.port, options, noop);
    expect(server.isStarttlsStarted()).toBe(true);

    server = await FakeServer.start({ starttls: false });
    await SMTP.start("127.0.0.1", server.port, options, noop);
    expect(server.isStarttlsStarted()).toBe(false);
  });

  it("start with starttls false", async () => {
    let server = await FakeServer.start({ starttls: true });
    const options = { starttls: false, tlsVerify: false };
    await SMTP.start("127.0.0.1", server.port, options, noop);
    expect(server.isStarttlsStarted()).toBe(false);

    server = await FakeServer.start({ starttls: false });
    await SMTP.start("127.0.0.1", server.port, options, noop);
    expect(server.isStarttlsStarted()).toBe(false);
  });

  it("start auth plain", async () => {
    const start = async (auth: string, password: string) => {
      const server = await FakeServer.start({ auth });
      const options = { user: "account", password, authtype: "plain" };
      return SMTP.start("127.0.0.1", server.port, options, noop);
    };
    await start("plain", "password");
    await expect(start("plain", "invalid")).rejects.toBeInstanceOf(SMTPAuthenticationError);
    await expect(start("login", "password")).rejects.toBeInstanceOf(SMTPAuthenticationError);
  });

  it("start auth login", async () => {
    const start = async (auth: string, password: string) => {
      const server = await FakeServer.start({ auth });
      const options = { user: "account", password, authtype: "login" };
      return SMTP.start("127.0.0.1", server.port, options, noop);
    };
    await start("LOGIN", "password");
    await expect(start("LOGIN", "invalid")).rejects.toBeInstanceOf(SMTPAuthenticationError);
    await expect(start("PLAIN", "password")).rejects.toBeInstanceOf(SMTPAuthenticationError);
  });

  it("start auth cram md5", async () => {
    const start = async (auth: string, password: string, authtype: string) => {
      const server = await FakeServer.start({ auth });
      const options = { user: "account", password, authtype };
      return SMTP.start("127.0.0.1", server.port, options, noop);
    };
    await start("CRAM-MD5", "password", "CRAM-MD5");
    await expect(start("CRAM-MD5", "invalid", "cram_md5")).rejects.toBeInstanceOf(
      SMTPAuthenticationError,
    );
    await expect(start("PLAIN", "password", "cram_md5")).rejects.toBeInstanceOf(
      SMTPAuthenticationError,
    );
  });

  it("send smtputf sender without server", async () => {
    const server = await FakeServer.start({ smtputf8: false });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    await smtp.sendMessage("message", "rené@example.com", "foo@example.com");
    expect(server.commands).toContain("MAIL FROM:<rené@example.com>\r\n");
  });

  it("send smtputf8 sender", async () => {
    const server = await FakeServer.start({ smtputf8: true });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    await smtp.sendMessage("message", "rené@example.com", "foo@example.com");
    expect(server.commands).toContain("MAIL FROM:<rené@example.com> SMTPUTF8\r\n");
  });

  it("send smtputf8 sender with size", async () => {
    const server = await FakeServer.start({ smtputf8: true });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    const from = new Address("rené@example.com", "SIZE=42");
    await smtp.sendMessage("message", from, "foo@example.com");
    expect(server.commands).toContain("MAIL FROM:<rené@example.com> SIZE=42 SMTPUTF8\r\n");
  });

  it("send smtputf recipient", async () => {
    const server = await FakeServer.start({ smtputf8: true });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    await smtp.sendMessage("message", "foo@example.com", "rené@example.com");
    expect(server.commands).toContain("MAIL FROM:<foo@example.com> SMTPUTF8\r\n");
  });

  it("mailfrom with smtputf detection", async () => {
    const server = await FakeServer.start({ smtputf8: true });
    const smtp = (await SMTP.start("127.0.0.1", server.port)) as SMTP;
    await smtp.mailfrom("rené@example.com");
    expect(server.commands.at(-1)).toBe("MAIL FROM:<rené@example.com> SMTPUTF8\r\n");
  });
});

describe("TestStarttls", () => {
  it("enable tls and enable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    expect(() => smtp.enableStarttls()).toThrow(ArgumentError);
  });

  it("enable tls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    expect(() => smtp.enableStarttlsAuto()).toThrow(ArgumentError);
  });

  it("enable starttls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableStarttls();
    expect(smtp.isStarttlsAlways()).toBe(true);
    smtp.enableStarttlsAuto();
    expect(smtp.isStarttlsAuto()).toBe(true);
  });

  it("disable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.disableStarttls();
    expect(smtp.isStarttls()).toBe(false);
  });
});
