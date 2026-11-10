import {
  File,
  b,
  basicObjRespondTo,
  rbCheckArrayType,
  each,
  rbEqual,
  rbInspect,
  rbObjClassname,
  rbObjRespondTo,
  stringInspect,
  RuntimeError,
  rbObjAsString,
  isPlainHash,
  Hash,
  eachPair,
  rbObjIsKindOf,
  IO,
  Encoding,
  toEnum,
  rbProcCall,
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
  RACK_PROTOCOL,
  RACK_LOGGER,
  RACK_MULTIPART_BUFFER_SIZE,
  RACK_MULTIPART_TEMPFILE_FACTORY,
  OPTIONS,
  CONNECT,
} from "./constants.js";
import { Rack } from "./namespaces.js";

export class LintError extends RuntimeError {}

LintError.prototype.name = "LintError";

export class InputWrapper {
  private _input: any;

  constructor(input: any) {
    this._input = input;
  }

  gets(...args: unknown[]): unknown {
    if (args.length !== 0) throw new LintError("rack.input#gets called with arguments");
    const v = this._input.gets();
    if (!(v == null || typeof v === "string" || v instanceof Uint8Array)) {
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
      if (!(typeof args[1] === "string" || args[1] instanceof Uint8Array)) {
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

  each(...args: [...unknown[], (line: string | Uint8Array) => unknown]): unknown {
    const block = args.pop() as (line: string | Uint8Array) => unknown;
    if (args.length !== 0) throw new LintError("rack.input#each called with arguments");
    return this._input.each((line: unknown) => {
      if (!(typeof line === "string" || line instanceof Uint8Array))
        throw new LintError("rack.input#each didn't yield a String");
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
    "append",
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

export class Wrapper {
  static InputWrapper = InputWrapper;
  static ErrorWrapper = ErrorWrapper;
  static StreamWrapper = StreamWrapper;

  private _app: RackApp | { call: RackApp };
  private env: Record<string, any> | null;
  private _response: any = null;
  private _headRequest = false;
  private status: any = null;
  private headers: any = null;
  private _body: any = null;
  private _consumed: string | null = null;
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

    this._response = await (rbProcCall(this._app, this.env) as ReturnType<RackApp>);
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

  /** @internal */
  private assertRequired(key: string): any {
    if (!Object.hasOwn(this.env!, key)) throw new LintError(`env missing required key ${key}`);

    return this.env![key];
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

    const keys = Reflect.ownKeys(env).filter((key) => typeof key !== "string");
    if (keys.length !== 0) {
      throw new LintError(`env contains non-string keys: ${rbInspect(keys)}`);
    }

    for (const [key, value] of Object.entries(env)) {
      if (key.includes(".")) continue;

      if (typeof value !== "string" && !(value instanceof Uint8Array)) {
        throw new LintError(`env variable ${key} has non-string value ${rbInspect(value)}`);
      }

      if (value instanceof Uint8Array) continue;

      if (/[\x80-\xff]/.test(String.fromCharCode(...b(value)))) {
        throw new LintError(
          `env variable ${key} has value containing non-ASCII characters and has non-ASCII-8BIT encoding ${rbInspect(value)} encoding: UTF-8`,
        );
      }
    }

    const requestMethod = this.assertRequired(REQUEST_METHOD);
    if (!/^[0-9A-Za-z!#$%&'*+.^_`|~-]+$/.test(requestMethod)) {
      throw new LintError(`REQUEST_METHOD unknown: ${rbInspect(requestMethod)}`);
    }

    const scriptName = env[SCRIPT_NAME];
    if (scriptName != null) {
      if (scriptName !== "" && !/^\//.test(scriptName)) {
        throw new LintError("SCRIPT_NAME must start with /");
      }

      if (scriptName === "/") {
        throw new LintError("SCRIPT_NAME cannot be '/', make it '' and PATH_INFO '/'");
      }
    }

    const pathInfo = env[PATH_INFO];
    if ((scriptName == null || scriptName === "") && (pathInfo == null || pathInfo === "")) {
      throw new LintError(
        "One of SCRIPT_NAME or PATH_INFO must be set (make PATH_INFO '/' if SCRIPT_NAME is empty)",
      );
    }

    if (pathInfo === Lint.REQUEST_PATH_ASTERISK_FORM) {
      if (requestMethod !== OPTIONS) {
        throw new LintError("Only OPTIONS requests may have PATH_INFO set to '*' (asterisk-form)");
      }
    } else if (pathInfo != null && Lint.REQUEST_PATH_AUTHORITY_FORM.test(pathInfo)) {
      if (requestMethod !== CONNECT) {
        throw new LintError(
          "Only CONNECT requests may have PATH_INFO set to an authority (authority-form)",
        );
      }
    } else if (pathInfo != null && Lint.REQUEST_PATH_ABSOLUTE_FORM.test(pathInfo)) {
      if (requestMethod === CONNECT || requestMethod === OPTIONS) {
        throw new LintError(
          "CONNECT and OPTIONS requests must not have PATH_INFO set to a URI (absolute-form)",
        );
      }
    } else if (pathInfo != null && Lint.REQUEST_PATH_ORIGIN_FORM.test(pathInfo)) {
      /** @empty */
    } else if (pathInfo === "" || pathInfo == null) {
      /** @empty */
    } else {
      throw new LintError(
        "PATH_INFO must start with a '/' and must not include a fragment part starting with '#' (origin-form)",
      );
    }

    this.assertRequired(QUERY_STRING);

    const serverName = this.assertRequired(SERVER_NAME);
    if (!Lint.SERVER_NAME_PATTERN.test(serverName)) {
      throw new LintError("env[SERVER_NAME] must be a valid host");
    }

    const serverProtocol = this.assertRequired(SERVER_PROTOCOL);
    if (!/HTTP\/\d(\.\d)?/.test(serverProtocol)) {
      throw new LintError("env[SERVER_PROTOCOL] does not match HTTP/\\d(\\.\\d)?");
    }

    const serverPort = env[SERVER_PORT];
    if (serverPort != null) {
      if (!/^\d+$/.test(serverPort)) {
        throw new LintError("env[SERVER_PORT] is not an Integer");
      }
    }

    const contentLength = env["CONTENT_LENGTH"];
    if (contentLength != null) {
      if (!/^\d+$/.test(contentLength)) {
        throw new LintError(`Invalid CONTENT_LENGTH: ${rbInspect(contentLength)}`);
      }
    }

    const httpHost = env[HTTP_HOST];
    if (httpHost != null) {
      if (!Lint.HTTP_HOST_PATTERN.test(httpHost)) {
        throw new LintError("env[HTTP_HOST] must be a valid authority");
      }
    }

    for (const header of ["HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"]) {
      if (Object.hasOwn(env, header)) {
        throw new LintError(`env contains ${header}, must use ${header.slice(5)}`);
      }
    }

    const rackUrlScheme = this.assertRequired(RACK_URL_SCHEME);
    if (!Lint.ALLOWED_SCHEMES.includes(rackUrlScheme)) {
      throw new LintError(`rack.url_scheme unknown: ${rbInspect(rackUrlScheme)}`);
    }

    const protocols = env[RACK_PROTOCOL];
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

    const rackMultipartBufferSize = env[RACK_MULTIPART_BUFFER_SIZE];
    if (rackMultipartBufferSize != null && rackMultipartBufferSize !== false) {
      if (!(Number.isInteger(rackMultipartBufferSize) && rackMultipartBufferSize > 0)) {
        throw new LintError("rack.multipart.buffer_size must be an Integer > 0 if specified");
      }
    }

    const rackMultipartTempfileFactory = env[RACK_MULTIPART_TEMPFILE_FACTORY];
    if (rackMultipartTempfileFactory != null && rackMultipartTempfileFactory !== false) {
      if (!rbObjRespondTo(rackMultipartTempfileFactory, "call")) {
        throw new LintError("rack.multipart.tempfile_factory must respond to #call");
      }
      env[RACK_MULTIPART_TEMPFILE_FACTORY] = (filename: string, contentType: string) => {
        const io = rackMultipartTempfileFactory(filename, contentType);
        if (!rbObjRespondTo(io, "append")) {
          throw new LintError("rack.multipart.tempfile_factory return value must respond to #<<");
        }
        return io;
      };
    }

    this.checkHijack(env);

    this.checkEarlyHints(env);

    const rackInput = env[RACK_INPUT];
    if (rackInput != null && rackInput !== false) {
      this.checkInputStream(rackInput);
      this.env![RACK_INPUT] = new InputWrapper(rackInput);
    }

    const rackErrors = this.assertRequired(RACK_ERRORS);
    this.checkErrorStream(rackErrors);
    this.env![RACK_ERRORS] = new ErrorWrapper(rackErrors);

    const rackResponseFinished = env[RACK_RESPONSE_FINISHED];
    if (rackResponseFinished != null && rackResponseFinished !== false) {
      if (!Array.isArray(rackResponseFinished)) {
        throw new LintError("rack.response_finished must be an array of callable objects");
      }
      for (const callable of rackResponseFinished) {
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
      throw new LintError(
        `rack.input ${rbObjAsString(input)} does not have ASCII-8BIT as its external encoding`,
      );
    }

    if (rbObjRespondTo(input, "isBinmode") && !input.isBinmode()) {
      throw new LintError(`rack.input ${rbObjAsString(input)} is not opened in binary mode`);
    }

    for (const method of ["gets", "each", "read"]) {
      if (!rbObjRespondTo(input, method)) {
        throw new LintError(`rack.input ${rbObjAsString(input)} does not respond to #${method}`);
      }
    }
  }

  checkErrorStream(error: any): void {
    for (const method of ["puts", "write", "flush"]) {
      if (!rbObjRespondTo(error, method)) {
        throw new LintError(`rack.error ${rbObjAsString(error)} does not respond to #${method}`);
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
    if (!rbObjIsKindOf(headers, Hash)) {
      throw new LintError(
        `headers object should be a hash, but isn't (got ${rbObjClassname(headers)} as headers)`,
      );
    }

    if (Object.isFrozen(headers)) {
      throw new LintError("headers object should not be frozen, but is");
    }

    // eslint-disable-next-line blazetrails/ruby-compat-native-required -- headers may be a Hash, which eachPair dispatches on
    eachPair(headers, (key: unknown, value: any) => {
      if (typeof key !== "string") {
        throw new LintError(`header key must be a string, was ${rbObjClassname(key)}`);
      }

      if (key.startsWith("rack.")) return;

      if (key === "status") throw new LintError("headers must not contain status");
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
    });
  }

  checkHeaderValue(key: string, value: string): void {
    // eslint-disable-next-line no-control-regex -- lint.rb:745 `/[\x00\x0A\x0D]/`
    if (/[\x00\x0A\x0D]/.test(value)) {
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

  verifyToPath(): void {
    if (rbObjRespondTo(this._body, "toPath")) {
      const optionalPath = this._body.toPath();

      if (optionalPath != null) {
        if (!(typeof optionalPath === "string" && File.isExist(optionalPath))) {
          throw new LintError("body.to_path must be nil or a path to an existing file");
        }
      }
    }
  }

  each(block: (chunk: string | Uint8Array) => unknown): void | Promise<void> {
    if (!rbObjRespondTo(this._body, "each")) {
      throw new LintError("Enumerable Body must respond to each");
    }

    if (this._consumed != null) {
      throw new LintError(`Response body must only be called once (${this._consumed})`);
    }

    if (this._closed) throw new LintError("Response body is already closed");

    this._consumed = "each";

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

  static readonly BODY_METHODS: Record<string, true> = {
    toAry: true,
    each: true,
    call: true,
    toPath: true,
  };

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

    if (this._consumed != null) {
      throw new LintError(`Response body must only be called once (${this._consumed})`);
    }

    if (this._closed) throw new LintError("Response body is already closed");

    this._consumed = "call";

    return this._body.call(new StreamWrapper(stream));
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    const chunks: (string | Uint8Array)[] = [];
    let wake: (() => void) | null = null;
    let done = false;
    let failed = false;
    let failure: unknown;
    void Promise.resolve()
      .then(() =>
        this.each((chunk) => {
          chunks.push(chunk);
          wake?.();
        }),
      )
      .catch((error: unknown) => {
        failed = true;
        failure = error;
      })
      .finally(() => {
        done = true;
        wake?.();
      });
    for (;;) {
      while (chunks.length > 0) yield chunks.shift()!;
      if (done) break;
      await new Promise<void>((resolve) => (wake = resolve));
      wake = null;
    }
    if (failed) throw failure;
  }
}

const _H = "[0-9A-Fa-f]";
const _DEC_OCTET = "(?:[1-9]\\d|1\\d{2}|2[0-4]\\d|25[0-5]|\\d)";
const _IPV4_ADDRESS = `${_DEC_OCTET}\\.${_DEC_OCTET}\\.${_DEC_OCTET}\\.${_DEC_OCTET}`;
const _LS32 = `(?:${_H}{1,4}:${_H}{1,4}|${_IPV4_ADDRESS})`;
const _IPV6_ADDRESS = [
  `(?:${_H}{1,4}:){6}${_LS32}`,
  `::(?:${_H}{1,4}:){5}${_LS32}`,
  `${_H}{1,4}?::(?:${_H}{1,4}:){4}${_LS32}`,
  `(?:(?:${_H}{1,4}:)?${_H}{1,4})?::(?:${_H}{1,4}:){3}${_LS32}`,
  `(?:(?:${_H}{1,4}:){0,2}${_H}{1,4})?::(?:${_H}{1,4}:){2}${_LS32}`,
  `(?:(?:${_H}{1,4}:){0,3}${_H}{1,4})?::${_H}{1,4}:${_LS32}`,
  `(?:(?:${_H}{1,4}:){0,4}${_H}{1,4})?::${_LS32}`,
  `(?:(?:${_H}{1,4}:){0,5}${_H}{1,4})?::${_H}{1,4}`,
  `(?:(?:${_H}{1,4}:){0,6}${_H}{1,4})?::`,
].join("|");
const _HOST_PATTERN =
  `(?:\\[(?:(?:${_IPV6_ADDRESS})|(?:v${_H}+\\.[!$&-.0-9:;=A-Z_a-z~]+))\\]` +
  `|${_IPV4_ADDRESS}` +
  `|(?:%${_H}${_H}|[!$&-.0-9;=A-Z_a-z~])*)`;

export class Lint {
  static readonly ALLOWED_SCHEMES = ["https", "http", "wss", "ws"];

  static readonly HOST_PATTERN = _HOST_PATTERN;
  static readonly SERVER_NAME_PATTERN = new RegExp(`^${_HOST_PATTERN}$`);
  static readonly HTTP_HOST_PATTERN = new RegExp(`^${_HOST_PATTERN}(:\\d*)?$`);

  static readonly REQUEST_PATH_ORIGIN_FORM = /^\/[^#]*$/;
  /** @missingRailsCall make_regexp — CONVERGEABLE uri-rfc2396-parser-make-regexp-unported */
  static readonly REQUEST_PATH_ABSOLUTE_FORM = /^[a-zA-Z][-+.a-zA-Z\d]*:[^\s]*$/;
  static readonly REQUEST_PATH_AUTHORITY_FORM = /^[^/:]+:\d+$/;
  static readonly REQUEST_PATH_ASTERISK_FORM = "*";

  private app: RackApp | { call: RackApp };

  constructor(app: RackApp | { call: RackApp }) {
    if (!rbObjRespondTo(app, "call")) throw new LintError("app must respond to call");

    this.app = app;
  }

  async call(env: Record<string, any> | null = null): Promise<[number, Record<string, any>, any]> {
    return new Wrapper(this.app, env).response();
  }

  static LintError = LintError;
  static Wrapper = Wrapper;
}

Rack.Lint = Lint;
