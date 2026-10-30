import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import {
  ArgumentError,
  EOFError,
  IOError,
  include,
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
  _ehloLines?: string[];
  _destroyed: boolean;
  _socket?: { setTimeout(ms: number): unknown; write(data: string): unknown };
  _sendCommand(str: string): void;
  _responseActions: Array<(str: string) => void>;
  lastServerResponse: string | false;
};

type ConnectionError = Error & { code?: string; response?: string };

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

function _isResponse(response: unknown): response is Response {
  return response instanceof Response;
}

export class SMTPAuthenticationError extends ProtoAuthError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
  }
}
include(SMTPAuthenticationError, SMTPError);

export class SMTPServerBusy extends ProtoServerError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
  }
}
include(SMTPServerBusy, SMTPError);

export class SMTPSyntaxError extends ProtoSyntaxError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
  }
}
include(SMTPSyntaxError, SMTPError);

export class SMTPFatalError extends ProtoFatalError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
  }
}
include(SMTPFatalError, SMTPError);

export class SMTPUnknownError extends ProtoUnknownError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
  }
}
include(SMTPUnknownError, SMTPError);

export class SMTPUnsupportedCommand extends ProtocolError {
  response: Response | null;
  /** @internal */
  _message: string | null;

  constructor(response: Response | string, { message = null }: { message?: string | null } = {}) {
    super();
    this.response = _isResponse(response) ? response : null;
    this._message = _isResponse(response) ? message : (message ?? response);
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

function _rethrow(err: ConnectionError): never {
  if (err.response) {
    const res = Response.parse(`${err.response}\n`);
    if (err.code === "EAUTH") throw new SMTPAuthenticationError(res);
    throw new res.exceptionClass(res);
  }
  if (err.code === "EAUTH") throw new SMTPAuthenticationError(err.message);
  if (err.code === "ECONNECTION") throw new EOFError("end of file reached");
  throw err;
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
   * @missingRailsCall critical — PERMANENT
   * @missingRailsCall check_response — PERMANENT
   * @missingRailsArgs do_helo — PERMANENT
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
    const context = (this.isTls() ? this._sslContextTls : this._sslContextStarttls) ?? {};
    const { verifyMode, ...tls } = context;
    const s = new SMTPConnection({
      host: this.address,
      port: this.port,
      name: heloDomain,
      secure: this.isTls(),
      requireTLS: this.isStarttlsAlways(),
      ignoreTLS: this._starttls === false,
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
      try {
        await new Promise<void>((resolve, reject) => {
          s.once("error", reject);
          s.connect(() => {
            s.removeListener("error", reject);
            resolve();
          });
        });
      } catch (err) {
        this.doHelo();
        if ((err as ConnectionError).code === "ETIMEDOUT") {
          throw new OpenTimeout("execution expired");
        }
        if ((err as ConnectionError).code === "ETLS" && !this.isCapableStarttls()) {
          throw new SMTPUnsupportedCommand("STARTTLS is not supported on this server");
        }
        _rethrow(err as ConnectionError);
      }
      s.on("error", () => {
        this._errorOccurred = true;
      });
      this.logging(`Connection opened: ${this.address}:${this.port}`);
      this.doHelo();
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
  private doHelo(): void {
    const lines = this._socket!._ehloLines ?? [];
    const res = Response.parse(`250-${this.address}\n${lines.map((l) => `250 ${l}\n`).join("")}`);
    this.capabilities = res.capabilities;
  }

  /** @internal */
  private async doFinish(): Promise<void> {
    const socket = this._socket;
    try {
      if (socket != null && !socket._destroyed && !this._errorOccurred) {
        await new Promise<void>((resolve) => {
          socket.once("end", () => resolve());
          socket.quit();
        });
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
    const to = toAddrs.flat();
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

  async authenticate(
    user: string,
    secret: string | null,
    authtype: string = SMTP.DEFAULT_AUTH_TYPE,
  ): Promise<Response> {
    this.checkAuthArgs(authtype, user, secret);
    const authenticator = new (Authenticator.authClass(authtype)!)(this);
    try {
      return Response.parse(`${await authenticator.auth(user, secret!)}\n`);
    } catch (err) {
      _rethrow(err as ConnectionError);
    }
  }

  /** @internal */
  private checkAuthArgs(type: string | null, ...args: Array<string | null>): void {
    const klass = Authenticator.authClass(type ?? SMTP.DEFAULT_AUTH_TYPE);
    if (klass == null) throw new ArgumentError(`wrong authentication type ${type}`);
    klass.checkArgs(...args);
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
    for (const addr of toAddrs.flat()) await this.rcptto(addr);
    return await block();
  }

  async rcptto(toAddr: string | Address): Promise<Response> {
    const addr = new Address(toAddr);
    return await this.getok([`RCPT TO:<${addr.address}>`, ...addr.parameters].join(" "));
  }

  async data(msgstr: string): Promise<Response> {
    const res = await this.critical(async () => {
      this.checkContinue(await this.getResponse("DATA"));
      const body = msgstr.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
      const tail = body.endsWith("\r\n") ? "" : "\r\n";
      this._socket!._socket.write(`${body}${tail}.\r\n`);
      return await this.recvResponse();
    });
    this.checkResponse(res);
    return res;
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
      socket._responseActions.push((str: string) => {
        socket.removeListener("end", eof);
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
