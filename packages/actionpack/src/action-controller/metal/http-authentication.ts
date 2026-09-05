import { OpenSSL } from "@blazetrails/ruby-compat";
import type { Metal } from "../metal.js";
import type { Request } from "../../action-dispatch/http/request.js";

export {
  BasicAuth,
  TokenAuth,
  DigestAuth,
  type BasicAuthCredentials,
  type TokenAuthCredentials,
  type DigestAuthParams,
} from "../../action-dispatch/http-authentication.js";

function splitOnFirstWhitespace(s: string): [string, string?] {
  const trimmed = s.replace(/^\s+/, "");
  const m = /\s+/.exec(trimmed);
  return m ? [trimmed.slice(0, m.index), trimmed.slice(m.index + m[0].length)] : [trimmed];
}

const reqAuth = (request: Request): string =>
  request.authorization == null ? "" : String(request.authorization);

export function authenticate<T>(
  request: Request,
  loginProcedure: (userName: string, password: string) => T,
): T | undefined {
  if (!hasBasicCredentials(request)) return undefined;
  const [user, pass] = userNameAndPassword(request);
  return loginProcedure(user, pass);
}

export function hasBasicCredentials(request: Request): boolean {
  return reqAuth(request).trim().length > 0 && authScheme(request).toLowerCase() === "basic";
}

export function userNameAndPassword(request: Request): [string, string] {
  const decoded = decodeCredentials(request);
  const idx = decoded.indexOf(":");
  return idx === -1 ? [decoded, ""] : [decoded.slice(0, idx), decoded.slice(idx + 1)];
}

export function decodeCredentials(request: Request): string {
  try {
    return Buffer.from(authParam(request) ?? "", "base64").toString("utf-8");
  } catch {
    return "";
  }
}

export function authScheme(request: Request): string {
  return splitOnFirstWhitespace(reqAuth(request))[0];
}

export function authParam(request: Request): string | undefined {
  return splitOnFirstWhitespace(reqAuth(request))[1];
}

export function encodeCredentials(userName: string, password: string): string {
  return `Basic ${Buffer.from(`${userName}:${password}`).toString("base64")}`;
}

export function authenticationRequest(
  controller: Metal,
  realm: string,
  message: string | null | undefined,
): void {
  controller.headers.set("WWW-Authenticate", `Basic realm="${realm.replace(/"/g, "")}"`);
  controller.status = 401;
  controller.responseBody = message ?? "HTTP Basic: Access denied.\n";
}

export function httpBasicAuthenticateOrRequestWith(
  this: Metal,
  options: { name: string; password: string; realm?: string | null; message?: string | null },
): boolean {
  const { name, password, realm = null, message = null } = options;
  return authenticateOrRequestWithHttpBasic.call(
    this,
    realm,
    message,
    (givenName: string, givenPassword: string): boolean => {
      const u = secureCompare(String(givenName ?? ""), name);
      const p = secureCompare(String(givenPassword ?? ""), password);
      return Boolean(u & p);
    },
  ) as boolean;
}

export function authenticateOrRequestWithHttpBasic<T>(
  this: Metal,
  realm: string | null | undefined,
  message: string | null | undefined,
  loginProcedure: (userName: string, password: string) => T,
): T | false {
  const result = authenticateWithHttpBasic.call<Metal, [typeof loginProcedure], T | undefined>(
    this,
    loginProcedure,
  );
  if (result) return result;
  requestHttpBasicAuthentication.call(this, realm ?? "Application", message);
  return false;
}

export function authenticateWithHttpBasic<T>(
  this: Metal,
  loginProcedure: (userName: string, password: string) => T,
): T | undefined {
  return authenticate(this.request, loginProcedure);
}

export function requestHttpBasicAuthentication(
  this: Metal,
  realm: string = "Application",
  message: string | null | undefined = null,
): void {
  authenticationRequest(this, realm, message);
}

export interface BasicClassDSLHost {
  beforeAction(cb: (controller: Metal) => unknown, options?: unknown): unknown;
}

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

function secureCompare(a: string, b: string): 0 | 1 {
  if (a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? 1 : 0;
}

export type DigestCredentials = Record<string, string | undefined>;

const md5Hex = (data: string) => OpenSSL.Digest.MD5.hexdigest(data);

export function digestAuthenticate(
  request: Request,
  realm: string,
  passwordProcedure: (username: string) => string | null | undefined,
): boolean {
  return !!(request.authorization && validateDigestResponse(request, realm, passwordProcedure));
}

export function validateDigestResponse(
  request: Request,
  realm: string,
  passwordProcedure: (username: string) => string | null | undefined,
): boolean {
  const sk = secretToken(request);
  const creds = decodeCredentialsHeader(request);
  if (
    !validateNonce(sk, request, creds.nonce ?? null) ||
    realm !== creds.realm ||
    opaque(sk) !== creds.opaque
  )
    return false;
  const password = passwordProcedure(creds.username ?? "");
  if (!password) return false;
  const method =
    (request.getHeader("rack.methodoverride.original_method") ??
      request.getHeader("REQUEST_METHOD")) ||
    "GET";
  const uri = creds.uri ?? "";
  return [true, false].some((q) =>
    [true, false].some(
      (isHa1) =>
        expectedResponse(method, q ? `${uri}?` : uri, creds, password, isHa1) === creds.response,
    ),
  );
}

export function expectedResponse(
  httpMethod: string,
  uri: string,
  credentials: DigestCredentials,
  password: string,
  passwordIsHa1 = true,
): string {
  const h1 = passwordIsHa1 ? password : ha1(credentials, password);
  const ha2 = md5Hex(`${httpMethod.toUpperCase()}:${uri}`);
  return md5Hex(
    [h1, credentials.nonce, credentials.nc, credentials.cnonce, credentials.qop, ha2].join(":"),
  );
}

export function ha1(credentials: DigestCredentials, password: string): string {
  return md5Hex(`${credentials.username}:${credentials.realm}:${password}`);
}

export function encodeDigestCredentials(
  httpMethod: string,
  credentials: DigestCredentials,
  password: string,
  passwordIsHa1: boolean,
): string {
  const c: DigestCredentials = { ...credentials };
  c.response = expectedResponse(httpMethod, c.uri ?? "", c, password, passwordIsHa1);
  return (
    "Digest " +
    Object.entries(c)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}='${v}'`)
      .join(", ")
  );
}

export function decodeCredentialsHeader(request: Request): DigestCredentials {
  return decodeDigestCredentials(request.authorization ?? "");
}

export function decodeDigestCredentials(header: string): DigestCredentials {
  const result: DigestCredentials = {};
  header
    .replace(/^Digest\s+/, "")
    .split(",")
    .forEach((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      result[pair.slice(0, eq).trim()] = pair
        .slice(eq + 1)
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/'/g, "");
    });
  return result;
}

export function authenticationHeader(controller: Metal, realm: string): void {
  const sk = secretToken(controller.request);
  controller.headers.set(
    "WWW-Authenticate",
    `Digest realm="${realm}", qop="auth", algorithm=MD5, nonce="${nonce(sk)}", opaque="${opaque(sk)}"`,
  );
}

export function digestAuthenticationRequest(
  controller: Metal,
  realm: string,
  message?: string | null,
): void {
  authenticationHeader(controller, realm);
  controller.status = 401;
  controller.responseBody = message ?? "HTTP Digest: Access denied.\n";
}

export function secretToken(request: Request): string {
  const keyGenerator = request.keyGenerator!;
  const httpAuthSalt = request.httpAuthSalt as string;
  const key = keyGenerator.generateKey(httpAuthSalt);
  return Buffer.isBuffer(key) ? key.toString("binary") : key;
}

export function nonce(secretKey: string, time?: number): string {
  const t = time ?? Math.floor(Date.now() / 1000);
  return Buffer.from(`${t}:${md5Hex(`${t}:${secretKey}`)}`).toString("base64");
}

export function validateNonce(
  secretKey: string,
  _request: Request,
  value: string | null | undefined,
  secondsToTimeout = 5 * 60,
): boolean {
  if (value == null) return false;
  const t = parseInt(Buffer.from(value, "base64").toString("utf-8").split(":")[0], 10);
  return (
    !isNaN(t) &&
    nonce(secretKey, t) === value &&
    Math.abs(t - Math.floor(Date.now() / 1000)) <= secondsToTimeout
  );
}

export function opaque(secretKey: string): string {
  return md5Hex(secretKey);
}

export function authenticateOrRequestWithHttpDigest(
  this: Metal,
  realm = "Application",
  message: string | null | undefined,
  passwordProcedure: (username: string) => string | null | undefined,
): boolean {
  const result = authenticateWithHttpDigest.call(this, realm, passwordProcedure);
  if (result) return result;
  requestHttpDigestAuthentication.call(this, realm, message);
  return false;
}

export function authenticateWithHttpDigest(
  this: Metal,
  realm = "Application",
  passwordProcedure: (username: string) => string | null | undefined,
): boolean {
  return !!(
    this.request.authorization && validateDigestResponse(this.request, realm, passwordProcedure)
  );
}

export function requestHttpDigestAuthentication(
  this: Metal,
  realm = "Application",
  message: string | null | undefined = null,
): void {
  digestAuthenticationRequest(this, realm, message);
}
