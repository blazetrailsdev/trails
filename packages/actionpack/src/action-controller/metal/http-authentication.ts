/**
 * ActionController::HttpAuthentication — Rails-fidelity Basic auth helpers
 * ported from `actionpack/lib/action_controller/metal/http_authentication.rb`.
 * Digest + Token live under the `BasicAuth`/`TokenAuth`/`DigestAuth` re-exports
 * pending P17b / P17c.
 */

export {
  BasicAuth,
  TokenAuth,
  DigestAuth,
  type BasicAuthCredentials,
  type TokenAuthCredentials,
  type DigestAuthParams,
} from "../../action-dispatch/http-authentication.js";

// ============================================================================
// HttpAuthentication::Basic
// ============================================================================

/** Mirrors Rails `request.authorization`. */
export interface BasicAuthRequestLike {
  authorization?: string | null;
}

/** Controller slice mutated by `authenticationRequest`. */
export interface BasicAuthControllerLike {
  headers: Record<string, string>;
  status: number | string;
  responseBody: string | string[] | Buffer | null | undefined;
}

// Ruby `String#split(" ", 2)`: split on the first whitespace run, ignoring
// leading whitespace. Returns up to two pieces.
function splitOnFirstWhitespace(s: string): [string, string?] {
  const trimmed = s.replace(/^\s+/, "");
  const m = /\s+/.exec(trimmed);
  return m ? [trimmed.slice(0, m.index), trimmed.slice(m.index + m[0].length)] : [trimmed];
}

const reqAuth = (request: BasicAuthRequestLike): string =>
  request.authorization == null ? "" : String(request.authorization);

/** Mirrors `Basic#authenticate`. */
export function authenticate<T>(
  request: BasicAuthRequestLike,
  loginProcedure: (userName: string, password: string) => T,
): T | undefined {
  if (!hasBasicCredentials(request)) return undefined;
  const [user, pass] = userNameAndPassword(request);
  return loginProcedure(user, pass);
}

/** Mirrors `Basic#has_basic_credentials?`. */
export function hasBasicCredentials(request: BasicAuthRequestLike): boolean {
  return reqAuth(request).trim().length > 0 && authScheme(request).toLowerCase() === "basic";
}

/** Mirrors `Basic#user_name_and_password`. */
export function userNameAndPassword(request: BasicAuthRequestLike): [string, string] {
  const decoded = decodeCredentials(request);
  const idx = decoded.indexOf(":");
  return idx === -1 ? [decoded, ""] : [decoded.slice(0, idx), decoded.slice(idx + 1)];
}

/** Mirrors `Basic#decode_credentials`. */
export function decodeCredentials(request: BasicAuthRequestLike): string {
  try {
    return Buffer.from(authParam(request) ?? "", "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/** Mirrors `Basic#auth_scheme`. */
export function authScheme(request: BasicAuthRequestLike): string {
  return splitOnFirstWhitespace(reqAuth(request))[0];
}

/** Mirrors `Basic#auth_param`. `Array#second` returns `nil` when there's no
 *  whitespace separator; we return `undefined`. */
export function authParam(request: BasicAuthRequestLike): string | undefined {
  return splitOnFirstWhitespace(reqAuth(request))[1];
}

/** Mirrors `Basic#encode_credentials`. */
export function encodeCredentials(userName: string, password: string): string {
  return `Basic ${Buffer.from(`${userName}:${password}`).toString("base64")}`;
}

/** Mirrors `Basic#authentication_request`. Mutates the controller in place. */
export function authenticationRequest(
  controller: BasicAuthControllerLike,
  realm: string,
  message: string | null | undefined,
): void {
  controller.headers["WWW-Authenticate"] = `Basic realm="${realm.replace(/"/g, "")}"`;
  controller.status = 401;
  controller.responseBody = message ?? "HTTP Basic: Access denied.\n";
}

// ============================================================================
// HttpAuthentication::Basic::ControllerMethods
// ============================================================================

export interface BasicControllerHost extends BasicAuthControllerLike {
  request: BasicAuthRequestLike;
}

/** Mirrors `Basic::ControllerMethods#http_basic_authenticate_or_request_with`.
 *  Bitwise `&` ensures both `secureCompare` calls always run — Rails' length-
 *  leak protection. */
export function httpBasicAuthenticateOrRequestWith(
  this: BasicControllerHost,
  options: { name: string; password: string; realm?: string | null; message?: string | null },
): boolean {
  const { name, password, realm = null, message = null } = options;
  return authenticateOrRequestWithHttpBasic.call(
    this as BasicControllerHost,
    realm,
    message,
    (givenName: string, givenPassword: string): boolean => {
      const u = secureCompare(String(givenName ?? ""), name);
      const p = secureCompare(String(givenPassword ?? ""), password);
      return Boolean(u & p);
    },
  ) as boolean;
}

/** Mirrors `Basic::ControllerMethods#authenticate_or_request_with_http_basic`. */
export function authenticateOrRequestWithHttpBasic<T>(
  this: BasicControllerHost,
  realm: string | null | undefined,
  message: string | null | undefined,
  loginProcedure: (userName: string, password: string) => T,
): T | false {
  const result = authenticateWithHttpBasic.call<
    BasicControllerHost,
    [typeof loginProcedure],
    T | undefined
  >(this, loginProcedure);
  if (result) return result;
  requestHttpBasicAuthentication.call(this, realm ?? "Application", message);
  return false;
}

/** Mirrors `Basic::ControllerMethods#authenticate_with_http_basic`. */
export function authenticateWithHttpBasic<T>(
  this: BasicControllerHost,
  loginProcedure: (userName: string, password: string) => T,
): T | undefined {
  return authenticate(this.request, loginProcedure);
}

/** Mirrors `Basic::ControllerMethods#request_http_basic_authentication`. */
export function requestHttpBasicAuthentication(
  this: BasicControllerHost,
  realm: string = "Application",
  message: string | null | undefined = null,
): void {
  authenticationRequest(this, realm, message);
}

// ============================================================================
// HttpAuthentication::Basic::ControllerMethods::ClassMethods
// ============================================================================

export interface BasicClassDSLHost {
  beforeAction(cb: (controller: BasicControllerHost) => unknown, options?: unknown): unknown;
}

/** Mirrors `Basic::ControllerMethods::ClassMethods#http_basic_authenticate_with`. */
export function httpBasicAuthenticateWith(
  this: BasicClassDSLHost,
  options: { name: string; password: string; realm?: string | null; [filter: string]: unknown },
): void {
  if (typeof options.name !== "string") {
    throw new TypeError(`Expected name: to be a String, got ${typeof options.name}`);
  }
  if (typeof options.password !== "string") {
    throw new TypeError(`Expected password: to be a String, got ${typeof options.password}`);
  }
  const { name, password, realm = null, ...rest } = options;
  this.beforeAction(function (controller) {
    return httpBasicAuthenticateOrRequestWith.call(controller, { name, password, realm });
  }, rest);
}

// Constant-time compare returning 0/1 — mirrors `SecurityUtils.secure_compare`.
// Returns 0/1 so callers can `&` results without short-circuit.
function secureCompare(a: string, b: string): 0 | 1 {
  if (a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? 1 : 0;
}
