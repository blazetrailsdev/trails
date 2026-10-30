import { afterEach, describe, expect, it } from "vitest";
import { ArgumentError, block } from "@blazetrails/ruby-compat";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
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
    const port = await fakeServerStart({ ...auth, authMethods: ["PLAIN"] });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    expect((await smtp.authenticate("account", "password", "plain")).isSuccess()).toBe(true);
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
    const port = await fakeServerStart({ ...auth, authMethods: ["XOAUTH2"] });
    const smtp = (await SMTP.start("127.0.0.1", port)) as SMTP;
    expect((await smtp.authenticate("account", "token", "xoauth2")).isSuccess()).toBe(true);
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
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    expect((await smtp.mailfrom("foo@example.com")).isSuccess()).toBe(true);
    await smtp.finish();
  });

  it("rcptto", async () => {
    const smtp = (await SMTP.start("127.0.0.1", await fakeServerStart())) as SMTP;
    await smtp.mailfrom("foo@example.com");
    expect((await smtp.rcptto("foo@example.com")).isSuccess()).toBe(true);
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
