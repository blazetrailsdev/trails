import {
  File,
  basicObjRespondTo,
  rbCheckArrayType,
  each,
  rbEqual,
  rbFSend,
  rbInspect,
  rbObjClassname,
  rbObjRespondTo,
  stringInspect,
  isPlainHash,
  kernelInteger,
  IO,
  Encoding,
  URI,
  toEnum,
} from "@blazetrails/ruby-compat";
import type { RackApp } from "./mock-request.js";
import {
  REQUEST_METHOD,
  SERVER_NAME,
  SERVER_PORT,
  SERVER_PROTOCOL,
  QUERY_STRING,
  PATH_INFO,
  SCRIPT_NAME,
  RACK_URL_SCHEME,
  RACK_INPUT,
  RACK_ERRORS,
  RACK_HIJACK,
  RACK_IS_HIJACK,
  RACK_EARLY_HINTS,
  RACK_RESPONSE_FINISHED,
  STATUS_WITH_NO_ENTITY_BODY,
  HEAD,
  HTTP_HOST,
  RACK_SESSION,
  RACK_LOGGER,
  RACK_MULTIPART_BUFFER_SIZE,
  RACK_MULTIPART_TEMPFILE_FACTORY,
  OPTIONS,
  CONNECT,
} from "./constants.js";

export class LintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LintError";
  }
}

export class Wrapper {
  static readonly BODY_METHODS: Record<string, true> = {
    toAry: true,
    each: true,
    call: true,
    toPath: true,
  };

  private _app: RackApp | { call: RackApp };
  private env: Record<string, any> | null;
  private _response: any = null;
  private _headRequest = false;
  private status: any = null;
  private headers: any = null;
  private _body: any = null;
  private _invoked: string | null = null;
  private _contentLength: string | null = null;
  private _closed = false;
  private size = 0;
  private _lint!: Wrapper[];

  constructor(app: RackApp | { call: RackApp }, env: Record<string, any> | null) {
    this._app = app;
    this.env = env;
  }

  /** @missingRailsName response — PERMANENT */
  async response(): Promise<[number, Record<string, any>, any]> {
    if (this.env == null) throw new LintError("No env given");
    this.checkEnvironment(this.env);

    this._response = await (rbFSend(this._app, "call", this.env) as ReturnType<RackApp>);
    if (!Array.isArray(this._response)) {
      throw new LintError(`response is not an Array, but ${rbObjClassname(this._response)}`);
    }
    if (Object.isFrozen(this._response)) throw new LintError("response is frozen");
    if (this._response.length !== 3) {
      throw new LintError(`response array has ${this._response.length} elements instead of 3`);
    }

    [this.status, this.headers, this._body] = this._response;
    this.checkStatus(this.status);

    this.checkHeaders(this.headers);

    const hijackProc = this.checkHijackResponse(this.headers, this.env);
    if (hijackProc != null) {
      this.headers[RACK_HIJACK] = hijackProc;
    }

    this.checkContentTypeHeader(this.status, this.headers);
    this.checkContentLengthHeader(this.status, this.headers);
    this.checkRackProtocolHeader(this.status, this.headers);
    this._headRequest = this.env[REQUEST_METHOD] === HEAD;

    this._lint = this.env["rack.lint"] ??= [];
    this._lint.push(this);

    if ((this.env["rack.lint.body_iteration"] ??= 0) > 0) {
      throw new LintError("Middleware must not call #each directly");
    }

    return [this.status, this.headers, this];
  }

  /**
   * @inventedArm isPlainHash — CONVERGEABLE ruby-compat-respond-to-answers-hash-store-fetch-delete-clear
   * @missingRailsArgs frozen? — PERMANENT
   */
  checkEnvironment(env: Record<string, any>): void {
    if (env === null || typeof env !== "object" || Array.isArray(env)) {
      throw new LintError(`env ${rbInspect(env)} is not a Hash, but ${rbObjClassname(env)}`);
    }
    if (Object.isFrozen(env)) throw new LintError("env should not be frozen, but is");

    const protocols = this.env!["rack.protocol"];
    if (protocols != null && protocols !== false) {
      if (
        !(Array.isArray(protocols) && protocols.every((protocol) => typeof protocol === "string"))
      ) {
        throw new LintError("rack.protocol must be an Array of Strings");
      }
    }

    const session = env[RACK_SESSION];
    if (session != null && session !== false && !isPlainHash(session)) {
      if (!(rbObjRespondTo(session, "store") && rbObjRespondTo(session, "set"))) {
        throw new LintError(`session ${rbInspect(session)} must respond to store and []=`);
      }
      if (!(rbObjRespondTo(session, "fetch") && rbObjRespondTo(session, "get"))) {
        throw new LintError(`session ${rbInspect(session)} must respond to fetch and []`);
      }
      if (!rbObjRespondTo(session, "delete")) {
        throw new LintError(`session ${rbInspect(session)} must respond to delete`);
      }
      if (!rbObjRespondTo(session, "clear")) {
        throw new LintError(`session ${rbInspect(session)} must respond to clear`);
      }
      if (
        !(
          rbObjRespondTo(session, "toHash") &&
          isPlainHash(session.toHash()) &&
          !Object.isFrozen(session.toHash())
        )
      ) {
        throw new LintError(
          `session ${rbInspect(session)} must respond to to_hash and return unfrozen Hash instance`,
        );
      }
    }

    const logger = env[RACK_LOGGER];
    if (logger != null && logger !== false) {
      if (!rbObjRespondTo(logger, "info")) {
        throw new LintError(`logger ${rbInspect(logger)} must respond to info`);
      }
      if (!rbObjRespondTo(logger, "debug")) {
        throw new LintError(`logger ${rbInspect(logger)} must respond to debug`);
      }
      if (!rbObjRespondTo(logger, "warn")) {
        throw new LintError(`logger ${rbInspect(logger)} must respond to warn`);
      }
      if (!rbObjRespondTo(logger, "error")) {
        throw new LintError(`logger ${rbInspect(logger)} must respond to error`);
      }
      if (!rbObjRespondTo(logger, "fatal")) {
        throw new LintError(`logger ${rbInspect(logger)} must respond to fatal`);
      }
    }

    const bufsize = env[RACK_MULTIPART_BUFFER_SIZE];
    if (bufsize != null && bufsize !== false) {
      if (!(Number.isInteger(bufsize) && bufsize > 0)) {
        throw new LintError("rack.multipart.buffer_size must be an Integer > 0 if specified");
      }
    }

    const tempfileFactory = env[RACK_MULTIPART_TEMPFILE_FACTORY];
    if (tempfileFactory != null && tempfileFactory !== false) {
      if (!rbObjRespondTo(tempfileFactory, "call")) {
        throw new LintError("rack.multipart.tempfile_factory must respond to #call");
      }
      env[RACK_MULTIPART_TEMPFILE_FACTORY] = (filename: string, contentType: string) => {
        const io = tempfileFactory(filename, contentType);
        if (!rbObjRespondTo(io, "<<")) {
          throw new LintError("rack.multipart.tempfile_factory return value must respond to #<<");
        }
        return io;
      };
    }

    for (const header of [
      REQUEST_METHOD,
      SERVER_NAME,
      QUERY_STRING,
      SERVER_PROTOCOL,
      RACK_ERRORS,
    ]) {
      if (!Object.hasOwn(env, header)) throw new LintError(`env missing required key ${header}`);
    }

    const serverPort = env[SERVER_PORT];
    if (serverPort != null) {
      try {
        kernelInteger(serverPort);
      } catch {
        throw new LintError("env[SERVER_PORT] is not an Integer");
      }
    }

    try {
      URI.parse(`http://${env[SERVER_NAME]}/`);
    } catch {
      throw new LintError(`${env[SERVER_NAME]} must be a valid authority`);
    }

    try {
      URI.parse(`http://${env[HTTP_HOST]}/`);
    } catch {
      throw new LintError(`${env[HTTP_HOST]} must be a valid authority`);
    }

    const serverProtocol = env[SERVER_PROTOCOL];
    if (!/HTTP\/\d(\.\d)?/.test(serverProtocol)) {
      throw new LintError("env[SERVER_PROTOCOL] does not match HTTP/\\d(\\.\\d)?");
    }

    for (const header of ["HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"]) {
      if (Object.hasOwn(env, header)) {
        throw new LintError(`env contains ${header}, must use ${header.slice(5)}`);
      }
    }

    for (const [key, value] of Object.entries(env)) {
      if (key.includes(".")) continue;
      if (value instanceof Uint8Array) continue;
      if (typeof value !== "string") {
        throw new LintError(`env variable ${key} has non-string value ${rbInspect(value)}`);
      }
      if (/[\u0080-\uffff]/.test(value)) {
        throw new LintError(
          `env variable ${key} has value containing non-ASCII characters and has non-ASCII-8BIT encoding ${rbInspect(value)} encoding: UTF-8`,
        );
      }
    }

    if (!["http", "https"].includes(env[RACK_URL_SCHEME])) {
      throw new LintError(`rack.url_scheme unknown: ${rbInspect(env[RACK_URL_SCHEME])}`);
    }

    const rackInput = env[RACK_INPUT];
    if (rackInput != null && rackInput !== false) {
      this.checkInputStream(rackInput);
      this.env![RACK_INPUT] = new InputWrapper(rackInput);
    }

    const rackErrors = env[RACK_ERRORS];
    this.checkErrorStream(rackErrors);
    this.env![RACK_ERRORS] = new ErrorWrapper(rackErrors);

    this.checkHijack(env);

    this.checkEarlyHints(env);

    if (!/^[0-9A-Za-z!#$%&'*+.^_`|~-]+$/.test(env[REQUEST_METHOD])) {
      throw new LintError(`REQUEST_METHOD unknown: ${rbInspect(env[REQUEST_METHOD])}`);
    }

    if (
      Object.hasOwn(env, SCRIPT_NAME) &&
      env[SCRIPT_NAME] !== "" &&
      !/^\//.test(env[SCRIPT_NAME])
    ) {
      throw new LintError("SCRIPT_NAME must start with /");
    }

    if (Object.hasOwn(env, PATH_INFO)) {
      const pathInfo = env[PATH_INFO];
      if (pathInfo === Lint.REQUEST_PATH_ASTERISK_FORM) {
        if (env[REQUEST_METHOD] !== OPTIONS) {
          throw new LintError(
            "Only OPTIONS requests may have PATH_INFO set to '*' (asterisk-form)",
          );
        }
      } else if (Lint.REQUEST_PATH_AUTHORITY_FORM.test(pathInfo)) {
        if (env[REQUEST_METHOD] !== CONNECT) {
          throw new LintError(
            "Only CONNECT requests may have PATH_INFO set to an authority (authority-form)",
          );
        }
      } else if (Lint.REQUEST_PATH_ABSOLUTE_FORM.test(pathInfo)) {
        if (env[REQUEST_METHOD] === CONNECT || env[REQUEST_METHOD] === OPTIONS) {
          throw new LintError(
            "CONNECT and OPTIONS requests must not have PATH_INFO set to a URI (absolute-form)",
          );
        }
      } else if (Lint.REQUEST_PATH_ORIGIN_FORM.test(pathInfo)) {
        /** @empty */
      } else if (pathInfo === "") {
        /** @empty */
      } else {
        throw new LintError(
          "PATH_INFO must start with a '/' and must not include a fragment part starting with '#' (origin-form)",
        );
      }
    }

    if (Object.hasOwn(env, "CONTENT_LENGTH") && !/^\d+$/.test(env["CONTENT_LENGTH"])) {
      throw new LintError(`Invalid CONTENT_LENGTH: ${env["CONTENT_LENGTH"]}`);
    }

    if (!(env[SCRIPT_NAME] != null || env[PATH_INFO] != null)) {
      throw new LintError(
        "One of SCRIPT_NAME or PATH_INFO must be set (make PATH_INFO '/' if SCRIPT_NAME is empty)",
      );
    }

    if (!(env[SCRIPT_NAME] !== "/")) {
      throw new LintError("SCRIPT_NAME cannot be '/', make it '' and PATH_INFO '/'");
    }

    const callables = env[RACK_RESPONSE_FINISHED];
    if (callables != null && callables !== false) {
      if (!Array.isArray(callables)) {
        throw new LintError("rack.response_finished must be an array of callable objects");
      }
      for (const callable of callables) {
        if (!rbObjRespondTo(callable, "call")) {
          throw new LintError(
            "rack.response_finished values must respond to call(env, status, headers, error)",
          );
        }
      }
    }
  }

  checkInputStream(input: any): void {
    if (rbObjRespondTo(input, "externalEncoding") && input.externalEncoding() !== Encoding.BINARY) {
      throw new LintError(`rack.input ${input} does not have ASCII-8BIT as its external encoding`);
    }

    if (rbObjRespondTo(input, "isBinmode") && !input.isBinmode()) {
      throw new LintError(`rack.input ${input} is not opened in binary mode`);
    }

    for (const method of ["gets", "each", "read"]) {
      if (!rbObjRespondTo(input, method)) {
        throw new LintError(`rack.input ${input} does not respond to #${method}`);
      }
    }
  }

  checkErrorStream(error: any): void {
    for (const method of ["puts", "write", "flush"]) {
      if (!rbObjRespondTo(error, method)) {
        throw new LintError(`rack.error ${error} does not respond to #${method}`);
      }
    }
  }

  checkHijack(env: Record<string, any>): void {
    const originalHijack = env[RACK_HIJACK];
    if (originalHijack != null && originalHijack !== false) {
      if (!rbObjRespondTo(originalHijack, "call")) {
        throw new LintError("rack.hijack must respond to call");
      }
      env[RACK_HIJACK] = () => {
        const io = originalHijack();
        if (!(io instanceof IO)) throw new LintError("rack.hijack must return an IO instance");
        return io;
      };
    }
  }

  checkHijackResponse(headers: Record<string, any>, env: Record<string, any>): unknown {
    if (env[RACK_IS_HIJACK]) {
      const originalHijack = headers[RACK_HIJACK];
      if (originalHijack != null && originalHijack !== false) {
        if (!rbObjRespondTo(originalHijack, "call")) {
          throw new LintError("rack.hijack header must respond to #call");
        }
        return (io: unknown) => originalHijack(new StreamWrapper(io));
      }
    } else {
      if (Object.hasOwn(headers, RACK_HIJACK)) {
        throw new LintError(
          "rack.hijack header must not be present if server does not support hijacking",
        );
      }
    }
    return null;
  }

  checkEarlyHints(env: Record<string, any>): void {
    if (env[RACK_EARLY_HINTS]) {
      if (!rbObjRespondTo(env[RACK_EARLY_HINTS], "call")) {
        throw new LintError("rack.early_hints must respond to call");
      }

      const originalCallback = env[RACK_EARLY_HINTS];
      env[RACK_EARLY_HINTS] = (headers: Record<string, any>) => {
        this.checkHeaders(headers);
        return originalCallback(headers);
      };
    }
  }

  checkStatus(status: number): void {
    if (!(Number.isInteger(status) && status >= 100)) {
      throw new LintError("Status must be an Integer >=100");
    }
  }

  checkHeaders(headers: Record<string, any>): void {
    if (headers === null || typeof headers !== "object" || Array.isArray(headers)) {
      throw new LintError(
        `headers object should be a hash, but isn't (got ${rbObjClassname(headers)} as headers)`,
      );
    }

    if (Object.isFrozen(headers)) {
      throw new LintError("headers object should not be frozen, but is");
    }

    for (const [key, value] of Object.entries(headers)) {
      if (typeof key !== "string") {
        throw new LintError(`header key must be a string, was ${rbObjClassname(key)}`);
      }

      if (key.startsWith("rack.")) continue;

      if (key === "status") throw new LintError("header must not contain status");
      if (/[(),/:;<=>?@[\\\]{}\p{Cc}]/u.test(key)) {
        throw new LintError(`invalid header name: ${key}`);
      }
      if (/[A-Z]/.test(key)) throw new LintError(`uppercase character in header name: ${key}`);

      if (typeof value === "string") {
        this.checkHeaderValue(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((value) => this.checkHeaderValue(key, value));
      } else {
        throw new LintError(
          `a header value must be a String or Array of Strings, but the value of '${key}' is a ${rbObjClassname(value)}`,
        );
      }
    }
  }

  checkHeaderValue(key: string, value: string): void {
    if (/[^\x20-\u{10ffff}]/u.test(value)) {
      throw new LintError(`invalid header value ${key}: ${stringInspect(value)}`);
    }
  }

  checkContentTypeHeader(status: number, headers: Record<string, any>): void {
    for (const key of Object.keys(headers)) {
      if (key === "content-type") {
        if (Object.hasOwn(STATUS_WITH_NO_ENTITY_BODY, status)) {
          throw new LintError(`content-type header found in ${status} response, not allowed`);
        }
        return;
      }
    }
  }

  checkContentLengthHeader(status: number, headers: Record<string, any>): void {
    for (const [key, value] of Object.entries(headers)) {
      if (key === "content-length") {
        if (Object.hasOwn(STATUS_WITH_NO_ENTITY_BODY, status)) {
          throw new LintError(`content-length header found in ${status} response, not allowed`);
        }
        this._contentLength = value;
      }
    }
  }

  verifyContentLength(size: number): void {
    if (this._headRequest) {
      if (size !== 0) {
        throw new LintError("Response body was given for HEAD request, but should be empty");
      }
    } else if (this._contentLength != null) {
      if (this._contentLength !== String(size)) {
        throw new LintError(
          `content-length header was ${this._contentLength}, but should be ${size}`,
        );
      }
    }
  }

  checkRackProtocolHeader(status: number, headers: Record<string, any>): void {
    const protocol = headers["rack.protocol"];

    if (protocol != null && protocol !== false) {
      const requestProtocols = this.env!["rack.protocol"];

      if (requestProtocols == null) {
        throw new LintError(
          `rack.protocol header is ${rbInspect(protocol)}, but rack.protocol was not set in request!`,
        );
      } else if (!requestProtocols.includes(protocol)) {
        throw new LintError(
          `rack.protocol header is ${rbInspect(protocol)}, but should be one of ${rbInspect(requestProtocols)} from the request!`,
        );
      }
    }
  }

  close(): void {
    this._closed = true;

    if (rbObjRespondTo(this._body, "close")) this._body.close();

    const index = this._lint.indexOf(this);
    if (!this.env!["rack.lint"].slice(0, index + 1).every((lint: Wrapper) => lint._closed)) {
      throw new LintError("Body has not been closed");
    }
  }

  async verifyToPath(): Promise<void> {
    if (rbObjRespondTo(this._body, "toPath")) {
      if (!(await File.isExistAsync(this._body.toPath()))) {
        throw new LintError("The file identified by body.to_path does not exist");
      }
    }
  }

  each(block: (chunk: string | Uint8Array) => unknown): void | Promise<void> {
    if (!rbObjRespondTo(this._body, "each")) {
      throw new LintError("Enumerable Body must respond to each");
    }

    if (this._invoked != null) {
      throw new LintError(`Response body must only be invoked once (${this._invoked})`);
    }

    if (this._closed) throw new LintError("Response body is already closed");

    this._invoked = "each";

    const iterate = (chunk: unknown) => {
      if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) {
        throw new LintError(`Body yielded non-string value ${rbInspect(chunk)}`);
      }

      if (this._lint[0] === this) {
        this.env!["rack.lint.body_iteration"] += 1;
      } else {
        if ((this.env!["rack.lint.body_iteration"] -= 1) > 0) {
          throw new LintError("New body must yield at least once per iteration of old body");
        }
      }

      this.size += Buffer.byteLength(chunk);
      block(chunk);
    };
    const iteration = Array.isArray(this._body)
      ? each(this._body, iterate)
      : this._body.each(iterate);

    const finish = () => {
      this.verifyContentLength(this.size);

      return this.verifyToPath();
    };
    return iteration instanceof Promise ? iteration.then(finish) : finish();
  }

  toPath(): string {
    return this._body.toPath();
  }

  isRespondTo(name: string): boolean {
    if (Object.hasOwn(Wrapper.BODY_METHODS, name)) {
      return rbObjRespondTo(this._body, name);
    } else {
      return basicObjRespondTo(this, name);
    }
  }

  toAry(): string[] {
    try {
      const content = rbCheckArrayType(this._body) as string[];
      if (!rbEqual(content, toEnum<string>(this._body).toA())) {
        throw new LintError("#to_ary not identical to contents produced by calling #each");
      }
      return content;
    } finally {
      this.close();
    }
  }

  call(stream: any): unknown {
    if (!rbObjRespondTo(this._body, "call")) {
      throw new LintError("Streaming Body must respond to call");
    }

    if (this._invoked != null) {
      throw new LintError(`Response body must only be invoked once (${this._invoked})`);
    }

    if (this._closed) throw new LintError("Response body is already closed");

    this._invoked = "call";

    return this._body.call(new StreamWrapper(stream));
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    const chunks: (string | Uint8Array)[] = [];
    await this.each((chunk) => chunks.push(chunk));
    yield* chunks;
  }
}

export class Lint {
  static readonly REQUEST_PATH_ORIGIN_FORM = /^\/[^#]*$/;
  /** @missingRailsCall make_regexp — CONVERGEABLE uri-rfc2396-parser-make-regexp-unported */
  static readonly REQUEST_PATH_ABSOLUTE_FORM = /^[a-zA-Z][-+.a-zA-Z\d]*:[^\s]*$/;
  static readonly REQUEST_PATH_AUTHORITY_FORM = /^[^/:]+:\d+$/;
  static readonly REQUEST_PATH_ASTERISK_FORM = "*";

  private app: RackApp | { call: RackApp };

  constructor(app: RackApp | { call: RackApp }) {
    this.app = app;
  }

  async call(env: Record<string, any> | null = null): Promise<[number, Record<string, any>, any]> {
    return new Wrapper(this.app, env).response();
  }

  static Wrapper = Wrapper;
}

export class InputWrapper {
  private _input: any;

  constructor(input: any) {
    this._input = input;
  }

  gets(...args: unknown[]): unknown {
    if (args.length !== 0) throw new LintError("rack.input#gets called with arguments");
    const v = this._input.gets();
    if (!(v == null || typeof v === "string")) {
      throw new LintError("rack.input#gets didn't return a String");
    }
    return v;
  }

  read(...args: any[]): unknown {
    if (!(args.length <= 2)) {
      throw new LintError("rack.input#read called with too many arguments");
    }
    if (args.length >= 1) {
      if (!(Number.isInteger(args[0]) || args[0] == null)) {
        throw new LintError("rack.input#read called with non-integer and non-nil length");
      }
      if (!(args[0] == null || args[0] >= 0)) {
        throw new LintError("rack.input#read called with a negative length");
      }
    }
    if (args.length >= 2) {
      if (typeof args[1] !== "string") {
        throw new LintError("rack.input#read called with non-String buffer");
      }
    }
    const v = this._input.read(...args);
    if (!(v == null || typeof v === "string" || v instanceof Uint8Array)) {
      throw new LintError("rack.input#read didn't return nil or a String");
    }
    if (args[0] == null) {
      if (v == null) throw new LintError("rack.input#read(nil) returned nil on EOF");
    }
    return v;
  }

  each(...args: [...unknown[], (line: string) => unknown]): unknown {
    const block = args.pop() as (line: string) => unknown;
    if (args.length !== 0) throw new LintError("rack.input#each called with arguments");
    return this._input.each((line: unknown) => {
      if (typeof line !== "string") throw new LintError("rack.input#each didn't yield a String");
      block(line);
    });
  }

  close(...args: unknown[]): unknown {
    return this._input.close(...args);
  }
}

export class ErrorWrapper {
  private _error: any;

  constructor(error: any) {
    this._error = error;
  }

  puts(str: unknown): unknown {
    return this._error.puts(str);
  }

  write(str: unknown): unknown {
    if (typeof str !== "string") throw new LintError("rack.errors#write not called with a String");
    return this._error.write(str);
  }

  flush(): unknown {
    return this._error.flush();
  }

  close(..._args: unknown[]): never {
    throw new LintError("rack.errors#close must not be called");
  }
}

export class StreamWrapper {
  static readonly REQUIRED_METHODS = [
    "read",
    "write",
    "<<",
    "flush",
    "close",
    "closeRead",
    "closeWrite",
    "isClosed",
  ];

  private _stream: any;

  constructor(stream: any) {
    this._stream = stream;

    for (const methodName of StreamWrapper.REQUIRED_METHODS) {
      if (!rbObjRespondTo(stream, methodName)) {
        throw new LintError(`Stream must respond to ${methodName}`);
      }
    }
  }
}

for (const methodName of StreamWrapper.REQUIRED_METHODS) {
  Object.defineProperty(StreamWrapper.prototype, methodName, {
    value(this: { _stream: any }, ...args: unknown[]) {
      return this._stream[methodName](...args);
    },
    writable: true,
    configurable: true,
  });
}
