import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import {
  ArgumentError,
  EOFError,
  IOError,
  include,
  isModuleIncluded,
  rbBlockGivenP,
  rbFArray,
  rbModName,
} from "@blazetrails/ruby-compat";
import { Authenticator } from "./authenticator.js";
import {
  OpenTimeout,
  ProtoAuthError,
  ProtoFatalError,
  ProtocolError,
  ProtoServerError,
  ProtoSyntaxError,
  ProtoUnknownError,
} from "./protocol.js";

type Connection = SMTPConnection & {
  _destroyed: boolean;
  options: { tls?: object };
  _socket?: { setTimeout(ms: number): unknown; write(data: string): unknown };
  _sendCommand(str: string): void;
  _responseActions: Array<(str: string) => void>;
  _actionGreeting(str: string): void;
  _clearPhase(): void;
  _upgradeConnection(callback: (err: Error | null) => void): void;
};

type ConnectionError = Error & { code?: string };

type SslContext = Record<string, unknown>;

interface StartOptions {
  helo?: string | null;
  user?: string | null;
  secret?: string | null;
  password?: string | null;
  authtype?: string | null;
}

interface NewOptions {
  tls?: boolean;
  starttls?: boolean | string;
  tlsVerify?: boolean;
  tlsHostname?: string | null;
  sslContextParams?: SslContext | null;
}

export const SMTPError = {
  get message(): string {
    const self = this as unknown as { _message: string | null; response: Response };
    return self._message ?? self.response.message;
  },
};

export class SMTPAuthenticationError extends ProtoAuthError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPAuthenticationError, SMTPError);

export class SMTPServerBusy extends ProtoServerError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPServerBusy, SMTPError);

export class SMTPSyntaxError extends ProtoSyntaxError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPSyntaxError, SMTPError);

export class SMTPFatalError extends ProtoFatalError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPFatalError, SMTPError);

export class SMTPUnknownError extends ProtoUnknownError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPUnknownError, SMTPError);

export class SMTPUnsupportedCommand extends ProtocolError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = response instanceof Response ? response : null;
    this._message = response instanceof Response ? message : (message ?? response);
  }
}
include(SMTPUnsupportedCommand, SMTPError);

export class Response {
  static parse(str: string): Response {
    return new Response(str.slice(0, 3), str);
  }

  readonly status: string;
  readonly string: string;

  constructor(status: string, string: string) {
    this.status = status;
    this.string = string;
  }

  statusTypeChar(): string {
    return this.status.slice(0, 1);
  }

  isSuccess(): boolean {
    return this.statusTypeChar() === "2";
  }

  isContinue(): boolean {
    return this.statusTypeChar() === "3";
  }

  get message(): string {
    return this.string.split(/(?<=\n)/)[0];
  }

  cramMd5Challenge(): string {
    return atob(this.string.split(" ")[1]);
  }

  get capabilities(): Record<string, string[]> {
    if (this.string.slice(3, 4) !== "-") return {};
    const h: Record<string, string[]> = {};
    for (const line of this.string.split(/(?<=\n)/).slice(1)) {
      const [k, ...v] = line.slice(4).trim().split(/\s+/);
      h[k] = v;
    }
    return h;
  }

  get exceptionClass(): new (response: Response) => Error {
    if (/^4/.test(this.status)) return SMTPServerBusy;
    if (/^50/.test(this.status)) return SMTPSyntaxError;
    if (/^53/.test(this.status)) return SMTPAuthenticationError;
    if (/^5/.test(this.status)) return SMTPFatalError;
    return SMTPUnknownError;
  }
}

export class Address {
  readonly address: string;
  readonly parameters: string[];

  constructor(address: string | Address, ...args: unknown[]) {
    const parameters = address instanceof Address ? address.parameters : [];
    this.address = address instanceof Address ? address.address : address;
    const params = [...parameters, ...args].flatMap((param) => rbFArray(param));
    this.parameters = [
      ...new Set(
        params.map((param) =>
          rbFArray(param)
            .filter((p) => p != null)
            .join("="),
        ),
      ),
    ];
  }

  toString(): string {
    return this.address;
  }
}

export class SMTP {
  static readonly VERSION = "0.5.1";
  static readonly DEFAULT_AUTH_TYPE = "plain";
  static readonly Response = Response;
  static readonly Address = Address;
  static readonly Authenticator = Authenticator;

  static defaultPort(): number {
    return 25;
  }

  static defaultSubmissionPort(): number {
    return 587;
  }

  static defaultTlsPort(): number {
    return 465;
  }

  static defaultSslPort(): number {
    return SMTP.defaultTlsPort();
  }

  /** @missingRailsCall new — PERMANENT */
  static defaultSslContext(sslContextParams: SslContext | null = null): SslContext {
    return { ...(sslContextParams ?? {}) };
  }

  static async start(
    address: string,
    port: number | null = null,
    ...args: unknown[]
  ): Promise<unknown> {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (smtp: SMTP) => unknown) : null;
    const last = args.at(-1);
    const isOptions = last !== null && typeof last === "object";
    const options = (isOptions ? args.pop() : {}) as StartOptions & NewOptions;
    const { tls = false, starttls = "auto", tlsVerify = true, tlsHostname = null } = options;
    const { sslContextParams = null } = options;
    if (args.length > 4) {
      throw new ArgumentError(
        `wrong number of arguments (given ${args.length + 2}, expected 1..6)`,
      );
    }
    const helo = options.helo ?? (args[0] as string | undefined) ?? "localhost";
    const user = options.user ?? (args[1] as string | undefined) ?? null;
    const secret = options.secret ?? options.password ?? (args[2] as string | undefined) ?? null;
    const authtype = options.authtype ?? (args[3] as string | undefined) ?? null;
    const smtp = new this(address, port, {
      tls,
      starttls,
      tlsVerify,
      tlsHostname,
      sslContextParams,
    });
    return block
      ? smtp.start({ helo, user, secret, authtype }, block)
      : smtp.start({ helo, user, secret, authtype });
  }

  readonly address: string;
  readonly port: number;
  esmtp: unknown = true;
  capabilities: Record<string, string[]> | null = null;
  tlsVerify: boolean;
  tlsHostname: string | null;
  sslContextParams: SslContext | null;
  openTimeout = 30;
  /** @internal */
  _socket: Connection | null = null;
  private _started = false;
  private _readTimeout = 60;
  private _errorOccurred = false;
  private _debugOutput: { write(str: string): unknown } | null = null;
  private _tls: boolean;
  private _starttls: boolean | string;
  private _sslContextTls: SslContext | null = null;
  private _sslContextStarttls: SslContext | null = null;

  constructor(
    address: string,
    port: number | null = null,
    {
      tls = false,
      starttls = "auto",
      tlsVerify = true,
      tlsHostname = null,
      sslContextParams = null,
    }: NewOptions = {},
  ) {
    this.address = address;
    this.port = port ?? SMTP.defaultPort();
    this._tls = tls;
    this._starttls = starttls;
    this.tlsVerify = tlsVerify;
    this.tlsHostname = tlsHostname;
    this.sslContextParams = sslContextParams;
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)} ${this.address}:${this.port} started=${this._started}>`;
  }

  isEsmtp(): unknown {
    return this.esmtp;
  }

  isCapableStarttls(): boolean | null {
    return this.isCapable("STARTTLS");
  }

  isCapable(key: string): boolean | null {
    if (this.capabilities == null) return null;
    return this.capabilities[key] != null;
  }

  isCapablePlainAuth(): boolean | null {
    return this.isAuthCapable("PLAIN");
  }

  isCapableLoginAuth(): boolean | null {
    return this.isAuthCapable("LOGIN");
  }

  isCapableCramMd5Auth(): boolean | null {
    return this.isAuthCapable("CRAM-MD5");
  }

  isAuthCapable(type: string): boolean | null {
    if (this.capabilities == null) return null;
    if (this.capabilities["AUTH"] == null) return false;
    return this.capabilities["AUTH"].includes(type);
  }

  capableAuthTypes(): string[] {
    if (this.capabilities == null) return [];
    return this.capabilities["AUTH"] ?? [];
  }

  isTls(): boolean {
    return this._tls;
  }

  isSsl(): boolean {
    return this.isTls();
  }

  enableTls(context: SslContext | null = null): void {
    if (this._starttls === "always") {
      throw new ArgumentError("SMTPS and STARTTLS is exclusive");
    }
    this._tls = true;
    this._sslContextTls = context;
  }

  enableSsl(context: SslContext | null = null): void {
    this.enableTls(context);
  }

  disableTls(): void {
    this._tls = false;
    this._sslContextTls = null;
  }

  disableSsl(): void {
    this.disableTls();
  }

  isStarttls(): boolean | string {
    return this._starttls;
  }

  isStarttlsAlways(): boolean {
    return this._starttls === "always";
  }

  isStarttlsAuto(): boolean {
    return this._starttls === "auto";
  }

  enableStarttls(context: SslContext | null = null): void {
    if (this._tls) throw new ArgumentError("SMTPS and STARTTLS is exclusive");
    this._starttls = "always";
    this._sslContextStarttls = context;
  }

  enableStarttlsAuto(context: SslContext | null = null): void {
    if (this._tls) throw new ArgumentError("SMTPS and STARTTLS is exclusive");
    this._starttls = "auto";
    this._sslContextStarttls = context;
  }

  disableStarttls(): void {
    this._starttls = false;
    this._sslContextStarttls = null;
  }

  get readTimeout(): number {
    return this._readTimeout;
  }

  set readTimeout(sec: number) {
    this._socket?._socket?.setTimeout(sec * 1000);
    this._readTimeout = sec;
  }

  set debugOutput(arg: { write(str: string): unknown } | null) {
    this._debugOutput = arg;
  }

  setDebugOutput(arg: { write(str: string): unknown } | null): void {
    this._debugOutput = arg;
  }

  isStarted(): boolean {
    return this._started;
  }

  async start(...args: unknown[]): Promise<unknown> {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (smtp: SMTP) => unknown) : null;
    const last = args.at(-1);
    const options = (last !== null && typeof last === "object" ? args.pop() : {}) as StartOptions;
    if (args.length > 4) {
      throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected 0..4)`);
    }
    const helo = options.helo ?? (args[0] as string | undefined) ?? "localhost";
    const user = options.user ?? (args[1] as string | undefined) ?? null;
    const secret = options.secret ?? options.password ?? (args[2] as string | undefined) ?? null;
    const authtype = options.authtype ?? (args[3] as string | undefined) ?? null;
    const sslContextParams = this.sslContextParams ?? {};
    if (!Object.hasOwn(sslContextParams, "verifyMode")) {
      sslContextParams["verifyMode"] = this.tlsVerify ? "VERIFY_PEER" : "VERIFY_NONE";
    }
    if (this._tls && this._sslContextTls == null) {
      this._sslContextTls = SMTP.defaultSslContext(sslContextParams);
    }
    if (this._starttls !== false && this._sslContextStarttls == null) {
      this._sslContextStarttls = SMTP.defaultSslContext(sslContextParams);
    }
    if (block) {
      try {
        await this.doStart(helo, user, secret, authtype);
        return await block(this);
      } finally {
        await this.doFinish();
      }
    }
    await this.doStart(helo, user, secret, authtype);
    return this;
  }

  async finish(): Promise<void> {
    if (!this.isStarted()) throw new IOError("not yet started");
    await this.doFinish();
  }

  /**
   * @internal
   * @inventedArm rescue — PERMANENT
   * @missingRailsCall order:critical,tlsconnect — CONVERGEABLE net-smtp-smtps-tlsconnect-in-do-start
   * @missingRailsArgs tlsconnect — CONVERGEABLE net-smtp-smtps-tlsconnect-in-do-start
   */
  private async doStart(
    heloDomain: string,
    user: string | null,
    secret: string | null,
    authtype: string | null,
  ): Promise<void> {
    if (this._started) throw new IOError("SMTP session already started");
    if (user != null || secret != null || authtype != null) {
      this.checkAuthArgs(authtype, user, secret);
    }
    const { verifyMode, ...tls } = this._sslContextTls ?? {};
    const s = new SMTPConnection({
      host: this.address,
      port: this.port,
      name: heloDomain,
      secure: this.isTls(),
      connectionTimeout: this.openTimeout * 1000,
      greetingTimeout: this.openTimeout * 1000,
      socketTimeout: this._readTimeout * 1000,
      tls: {
        ...tls,
        rejectUnauthorized: verifyMode !== "VERIFY_NONE",
        servername: this.tlsHostname ?? this.address,
      },
    }) as Connection;
    this._socket = s;
    try {
      this.logging(`Connection opened: ${this.address}:${this.port}`);
      this.checkResponse(
        await this.critical(async () => {
          let onError: (err: Error) => void;
          try {
            return await new Promise<Response>((resolve, reject) => {
              onError = reject;
              s.once("error", onError);
              s._actionGreeting = (str: string) => {
                s._clearPhase();
                resolve(Response.parse(`${str}\n`));
              };
              s.connect();
            });
          } catch (err) {
            if ((err as ConnectionError).code === "ETIMEDOUT") {
              throw new OpenTimeout("execution expired");
            }
            if ((err as ConnectionError).code === "ECONNECTION") {
              throw new EOFError("end of file reached");
            }
            throw err;
          } finally {
            s.removeListener("error", onError!);
          }
        }),
      );
      s.on("error", () => {
        this._errorOccurred = true;
      });
      await this.doHelo(heloDomain);
      if (
        !this.isTls() &&
        (this.isStarttlsAlways() || (this.isCapableStarttls() && this.isStarttlsAuto()))
      ) {
        if (!this.isCapableStarttls()) {
          throw new SMTPUnsupportedCommand("STARTTLS is not supported on this server");
        }
        await this.starttls();
        await this.tlsconnect(s, this._sslContextStarttls);
        await this.doHelo(heloDomain);
      }
      if (user != null) {
        await this.authenticate(user, secret, authtype ?? SMTP.DEFAULT_AUTH_TYPE);
      }
      this._started = true;
    } finally {
      if (!this._started) {
        s.close();
        this._socket = null;
      }
    }
  }

  /** @internal */
  private async tlsconnect(s: Connection, context: SslContext | null): Promise<void> {
    const { verifyMode, ...tls } = context ?? {};
    s.options.tls = {
      ...tls,
      rejectUnauthorized: verifyMode !== "VERIFY_NONE",
      servername: this.tlsHostname ?? this.address,
    };
    this.logging("TLS connection started");
    await new Promise<void>((resolve, reject) => {
      s.once("error", reject);
      s._upgradeConnection((err) => {
        s.removeListener("error", reject);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @internal */
  private async doHelo(heloDomain: string): Promise<void> {
    for (;;) {
      try {
        const res = this.esmtp ? await this.ehlo(heloDomain) : await this.helo(heloDomain);
        this.capabilities = res.capabilities;
        return;
      } catch (err) {
        if (this.esmtp && err instanceof Error && isModuleIncluded(err.constructor, SMTPError)) {
          this.esmtp = false;
          this._errorOccurred = false;
          continue;
        }
        throw err;
      }
    }
  }

  /** @internal */
  private async doFinish(): Promise<void> {
    const socket = this._socket;
    try {
      if (socket != null && !socket._destroyed && !this._errorOccurred) {
        await this.quit();
      }
    } finally {
      this._started = false;
      this._errorOccurred = false;
      socket?.close();
      this._socket = null;
    }
  }

  /** @internal */
  private requiresSmtputf8(address: string | Address): boolean {
    const str = address instanceof Address ? address.address : address;
    return /[^\p{ASCII}]/u.test(str);
  }

  /** @internal */
  private anyRequireSmtputf8(addresses: Array<string | Address>): boolean {
    return addresses.some((a) => this.requiresSmtputf8(a));
  }

  async sendMessage(
    msgstr: string,
    fromAddr: string | Address,
    ...toAddrs: Array<string | Address | Array<string | Address>>
  ): Promise<Response> {
    const to = toAddrs.flat(Infinity) as Array<string | Address>;
    if (this._socket == null) throw new IOError("closed session");
    if (this.anyRequireSmtputf8(to) && this.isCapable("SMTPUTF8")) {
      fromAddr = new Address(fromAddr, "SMTPUTF8");
    }
    await this.mailfrom(fromAddr);
    return await this.rcpttoList(to, () => this.data(msgstr));
  }

  sendMail(
    msgstr: string,
    fromAddr: string | Address,
    ...toAddrs: Array<string | Address | Array<string | Address>>
  ): Promise<Response> {
    return this.sendMessage(msgstr, fromAddr, ...toAddrs);
  }

  sendmail(
    msgstr: string,
    fromAddr: string | Address,
    ...toAddrs: Array<string | Address | Array<string | Address>>
  ): Promise<Response> {
    return this.sendMessage(msgstr, fromAddr, ...toAddrs);
  }

  async openMessageStream(fromAddr: string | Address, ...toAddrs: unknown[]): Promise<Response> {
    const block = toAddrs.pop() as (stream: { write(str: string): unknown }) => unknown;
    const to = toAddrs.flat(Infinity) as Array<string | Address>;
    if (this._socket == null) throw new IOError("closed session");
    if (this.anyRequireSmtputf8(to) && this.isCapable("SMTPUTF8")) {
      fromAddr = new Address(fromAddr, "SMTPUTF8");
    }
    await this.mailfrom(fromAddr);
    return await this.rcpttoList(to, () => this.data(null, block));
  }

  ready(fromAddr: string | Address, ...toAddrs: unknown[]): Promise<Response> {
    return this.openMessageStream(fromAddr, ...toAddrs);
  }

  async authenticate(
    user: string,
    secret: string | null,
    authtype: string = SMTP.DEFAULT_AUTH_TYPE,
  ): Promise<Response> {
    this.checkAuthArgs(authtype, user, secret);
    const authenticator = new (Authenticator.authClass(authtype)!)(this);
    return await authenticator.auth(user, secret!);
  }

  /** @internal */
  private checkAuthArgs(type: string | null, ...args: Array<string | null>): void {
    const klass = Authenticator.authClass(type ?? SMTP.DEFAULT_AUTH_TYPE);
    if (klass == null) throw new ArgumentError(`wrong authentication type ${type}`);
    klass.checkArgs(...args);
  }

  async starttls(): Promise<Response> {
    return await this.getok("STARTTLS");
  }

  async helo(domain: string): Promise<Response> {
    return await this.getok(`HELO ${domain}`);
  }

  async ehlo(domain: string): Promise<Response> {
    return await this.getok(`EHLO ${domain}`);
  }

  async rset(): Promise<Response> {
    return await this.getok("RSET");
  }

  async mailfrom(fromAddr: string | Address): Promise<Response> {
    const addr =
      this.requiresSmtputf8(fromAddr) && this.isCapable("SMTPUTF8")
        ? new Address(fromAddr, "SMTPUTF8")
        : new Address(fromAddr);
    return await this.getok([`MAIL FROM:<${addr.address}>`, ...addr.parameters].join(" "));
  }

  async rcpttoList<T>(toAddrs: Array<string | Address>, block: () => Promise<T>): Promise<T> {
    if (toAddrs.length === 0) throw new ArgumentError("mail destination not given");
    for (const addr of toAddrs.flat(Infinity) as Array<string | Address>) await this.rcptto(addr);
    return await block();
  }

  async rcptto(toAddr: string | Address): Promise<Response> {
    const addr = new Address(toAddr);
    return await this.getok([`RCPT TO:<${addr.address}>`, ...addr.parameters].join(" "));
  }

  async data(
    msgstr: string | null = null,
    block: ((stream: { write(str: string): unknown }) => unknown) | null = null,
  ): Promise<Response> {
    if (msgstr != null && block != null) {
      throw new ArgumentError("message and block are exclusive");
    }
    if (msgstr == null && block == null) throw new ArgumentError("message or block is required");
    const res = await this.critical(async () => {
      this.checkContinue(await this.getResponse("DATA"));
      const chunks: string[] = msgstr != null ? [msgstr] : [];
      if (block != null) await block({ write: (str: string) => chunks.push(str) });
      const body = chunks
        .join("")
        .replace(/\r\n|\n|\r/g, "\r\n")
        .replace(/^\./gm, "..");
      const tail = body.endsWith("\r\n") ? "" : "\r\n";
      this._socket!._socket.write(`${body}${tail}.\r\n`);
      return await this.recvResponse();
    });
    this.checkResponse(res);
    return res;
  }

  async quit(): Promise<Response> {
    return await this.getok("QUIT");
  }

  async getResponse(reqline: string): Promise<Response> {
    this.validateLine(reqline);
    this._socket!._sendCommand(reqline);
    return await this.recvResponse();
  }

  /** @internal */
  private validateLine(line: string): void {
    if (/[\r\n]/.test(line)) throw new ArgumentError("A line must not contain CR or LF");
  }

  /** @internal */
  private async getok(reqline: string): Promise<Response> {
    this.validateLine(reqline);
    const res = await this.critical(async () => {
      this._socket!._sendCommand(reqline);
      return await this.recvResponse();
    });
    this.checkResponse(res);
    return res;
  }

  /** @internal */
  private recvResponse(): Promise<Response> {
    const socket = this._socket!;
    return new Promise((resolve, reject) => {
      const eof = (): void => reject(new EOFError("end of file reached"));
      if (socket._destroyed) return eof();
      socket.once("end", eof);
      socket.once("error", reject);
      socket._responseActions.push((str: string) => {
        socket.removeListener("end", eof);
        socket.removeListener("error", reject);
        resolve(Response.parse(`${str}\n`));
      });
    });
  }

  /** @internal */
  async critical<T>(block?: () => T | Promise<T>): Promise<T | Response> {
    if (this._errorOccurred) return Response.parse("200 dummy reply code");
    try {
      return await block!();
    } catch (err) {
      this._errorOccurred = true;
      throw err;
    }
  }

  /** @internal */
  private checkResponse(res: Response): void {
    if (!res.isSuccess()) throw new res.exceptionClass(res);
  }

  /** @internal */
  private checkContinue(res: Response): void {
    if (!res.isContinue()) {
      throw new SMTPUnknownError(res, {
        message: `could not get 3xx (${res.status}: ${res.string})`,
      });
    }
  }

  /** @internal */
  private logging(msg: string): void {
    this._debugOutput?.write(`${msg}\n`);
  }
}

export const SMTPSession = SMTP;

import "./auth-plain.js";
import "./auth-login.js";
import "./auth-cram-md5.js";
import "./auth-xoauth2.js";
import "./class-paths.generated.js";
