/* eslint-disable @typescript-eslint/no-namespace -- `HttpAuthentication::Basic`, `Digest` and `Token` each nest a `ControllerMethods` and share `authenticate` / `encode_credentials` / `authentication_request` (`action_controller/metal/http_authentication.rb:69,189,425`); nested namespaces keep every one at its Rails name. */
import {
  ArgumentError,
  OpenSSL,
  rbFSend,
  rbInspect,
  rbObjClassname,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { extend, included, type Included } from "@blazetrails/ruby-compat/include";
import {
  HashWithIndifferentAccess,
  isBlank,
  isPresent,
  SecurityUtils,
} from "@blazetrails/activesupport";
import type { Metal } from "../metal.js";
import type { Request } from "../../action-dispatch/http/request.js";

type BasicController = Metal & Included<typeof HttpAuthentication.Basic.ControllerMethods>;
type DigestController = Metal & Included<typeof HttpAuthentication.Digest.ControllerMethods>;
type TokenController = Metal & Included<typeof HttpAuthentication.Token.ControllerMethods>;

export type DigestCredentials = HashWithIndifferentAccess<string | undefined>;

export interface BasicClassDSLHost {
  beforeAction(cb: (controller: Metal) => unknown, options?: unknown): unknown;
}

export namespace HttpAuthentication {
  export namespace Basic {
    export namespace ControllerMethods {
      export namespace ClassMethods {
        export function httpBasicAuthenticateWith(
          this: BasicClassDSLHost,
          {
            name,
            password,
            realm = null,
            ...options
          }: { name: string; password: string; realm?: string | null; [filter: string]: unknown },
        ): void {
          if (typeof name !== "string") {
            throw new ArgumentError(`Expected name: to be a String, got ${rbObjClassname(name)}`);
          }
          if (typeof password !== "string") {
            throw new ArgumentError(
              `Expected password: to be a String, got ${rbObjClassname(password)}`,
            );
          }
          this.beforeAction(
            (controller) =>
              (controller as BasicController).httpBasicAuthenticateOrRequestWith({
                name: name,
                password: password,
                realm: realm,
              }),
            options,
          );
        }
      }

      export function httpBasicAuthenticateOrRequestWith(
        this: BasicController,
        {
          name,
          password,
          realm = null,
          message = null,
        }: { name: string; password: string; realm?: string | null; message?: string | null },
      ): unknown {
        return this.authenticateOrRequestWithHttpBasic(
          realm,
          message,
          (givenName: string, givenPassword: string): boolean => {
            const nameMatches = SecurityUtils.secureCompare(String(givenName ?? ""), name);
            const passwordMatches = SecurityUtils.secureCompare(
              String(givenPassword ?? ""),
              password,
            );
            return nameMatches && passwordMatches;
          },
        );
      }

      export function authenticateOrRequestWithHttpBasic<T>(
        this: BasicController,
        realm: string | null | undefined,
        message: string | null | undefined,
        loginProcedure: (userName: string, password: string) => T,
      ): T | string {
        const authenticated = this.authenticateWithHttpBasic(loginProcedure) as T | undefined;
        return authenticated != null && authenticated !== false
          ? authenticated
          : this.requestHttpBasicAuthentication(realm ?? "Application", message);
      }

      export function authenticateWithHttpBasic<T>(
        this: BasicController,
        loginProcedure: (userName: string, password: string) => T,
      ): T | undefined {
        return HttpAuthentication.Basic.authenticate(this.request, loginProcedure);
      }

      export function requestHttpBasicAuthentication(
        this: BasicController,
        realm: string = "Application",
        message: string | null | undefined = null,
      ): string {
        return HttpAuthentication.Basic.authenticationRequest(this, realm, message);
      }
    }

    export function authenticate<T>(
      request: Request,
      loginProcedure: (userName: string, password: string) => T,
    ): T | undefined {
      if (hasBasicCredentials(request)) {
        return loginProcedure(...(userNameAndPassword(request) as [string, string]));
      }
    }

    export function hasBasicCredentials(request: Request): boolean {
      return isPresent(request.authorization) && authScheme(request).toLowerCase() === "basic";
    }

    export function userNameAndPassword(request: Request): string[] {
      return stringSplit(decodeCredentials(request), ":", 2);
    }

    export function decodeCredentials(request: Request): string {
      return Buffer.from(authParam(request) ?? "", "base64").toString("utf-8");
    }

    export function authScheme(request: Request): string {
      return stringSplit(String(request.authorization ?? ""), " ", 2)[0];
    }

    export function authParam(request: Request): string | undefined {
      return stringSplit(String(request.authorization ?? ""), " ", 2)[1];
    }

    export function encodeCredentials(userName: string, password: string): string {
      return `Basic ${Buffer.from(`${userName}:${password}`).toString("base64")}`;
    }

    export function authenticationRequest(
      controller: Metal,
      realm: string,
      message: string | null | undefined,
    ): string {
      message ??= "HTTP Basic: Access denied.\n";
      controller.headers.set("WWW-Authenticate", `Basic realm="${realm.replace(/"/g, "")}"`);
      controller.status = 401;
      return (controller.responseBody = message);
    }
  }

  export namespace Digest {
    export namespace ControllerMethods {
      export function authenticateOrRequestWithHttpDigest(
        this: DigestController,
        realm = "Application",
        message: string | null | undefined,
        passwordProcedure: (username: string) => string | null | undefined,
      ): boolean | string {
        return (
          this.authenticateWithHttpDigest(realm, passwordProcedure) ||
          this.requestHttpDigestAuthentication(realm, message)
        );
      }

      export function authenticateWithHttpDigest(
        this: DigestController,
        realm = "Application",
        passwordProcedure: (username: string) => string | null | undefined,
      ): boolean | undefined {
        return HttpAuthentication.Digest.authenticate(this.request, realm, passwordProcedure);
      }

      export function requestHttpDigestAuthentication(
        this: DigestController,
        realm = "Application",
        message: string | null | undefined = null,
      ): string {
        return HttpAuthentication.Digest.authenticationRequest(this, realm, message);
      }
    }

    export function authenticate(
      request: Request,
      realm: string,
      passwordProcedure: (username: string) => string | null | undefined,
    ): boolean | undefined {
      return (
        request.authorization != null && validateDigestResponse(request, realm, passwordProcedure)
      );
    }

    export function validateDigestResponse(
      request: Request,
      realm: string,
      passwordProcedure: (username: string) => string | null | undefined,
    ): boolean | undefined {
      const secretKey = secretToken(request);
      const credentials = decodeCredentialsHeader(request);
      const validNonce = validateNonce(secretKey, request, credentials.get("nonce"));

      if (
        validNonce &&
        realm === credentials.get("realm") &&
        opaque(secretKey) === credentials.get("opaque")
      ) {
        const password = passwordProcedure(credentials.get("username") as string);
        if (password == null) return false;

        const method = (request.getHeader("rack.methodoverride.original_method") ??
          request.getHeader("REQUEST_METHOD")) as string;
        const uri = credentials.get("uri") as string;

        return [true, false].some((trailingQuestionMark) =>
          [true, false].some((passwordIsHa1) => {
            const _uri = trailingQuestionMark ? uri + "?" : uri;
            const expected = expectedResponse(method, _uri, credentials, password, passwordIsHa1);
            return expected === credentials.get("response");
          }),
        );
      }
    }

    export function expectedResponse(
      httpMethod: string,
      uri: string,
      credentials: DigestCredentials,
      password: string,
      passwordIsHa1 = true,
    ): string {
      const ha1 = passwordIsHa1 ? password : Digest.ha1(credentials, password);
      const ha2 = OpenSSL.Digest.MD5.hexdigest(
        [String(httpMethod ?? "").toUpperCase(), uri].join(":"),
      );
      return OpenSSL.Digest.MD5.hexdigest(
        [
          ha1,
          credentials.get("nonce"),
          credentials.get("nc"),
          credentials.get("cnonce"),
          credentials.get("qop"),
          ha2,
        ].join(":"),
      );
    }

    export function ha1(credentials: DigestCredentials, password: string): string {
      return OpenSSL.Digest.MD5.hexdigest(
        [credentials.get("username"), credentials.get("realm"), password].join(":"),
      );
    }

    export function encodeCredentials(
      httpMethod: string,
      credentials: DigestCredentials,
      password: string,
      passwordIsHa1: boolean,
    ): string {
      credentials.set(
        "response",
        expectedResponse(
          httpMethod,
          credentials.get("uri") as string,
          credentials,
          password,
          passwordIsHa1,
        ),
      );
      return (
        "Digest " +
        [...credentials]
          .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
          .map((v) => `${v[0]}='${v[1]}'`)
          .join(", ")
      );
    }

    export function decodeCredentialsHeader(request: Request): DigestCredentials {
      return decodeCredentials(request.authorization);
    }

    export function decodeCredentials(header: string | null | undefined): DigestCredentials {
      return new HashWithIndifferentAccess(
        Object.fromEntries(
          stringSplit(String(header ?? "").replace(/^Digest\s+/gm, ""), ",").map((pair) => {
            const [key, value] = stringSplit(pair, "=", 2);
            return [
              key.trim(),
              String(value ?? "")
                .replace(/^"|"$/gm, "")
                .replace(/'/g, ""),
            ];
          }),
        ),
      );
    }

    export function authenticationHeader(controller: Metal, realm: string): void {
      const secretKey = secretToken(controller.request);
      const nonce = Digest.nonce(secretKey);
      const opaque = Digest.opaque(secretKey);
      controller.headers.set(
        "WWW-Authenticate",
        `Digest realm="${realm}", qop="auth", algorithm=MD5, nonce="${nonce}", opaque="${opaque}"`,
      );
    }

    export function authenticationRequest(
      controller: Metal,
      realm: string,
      message: string | null | undefined = null,
    ): string {
      message ??= "HTTP Digest: Access denied.\n";
      authenticationHeader(controller, realm);
      controller.status = 401;
      return (controller.responseBody = message);
    }

    export function secretToken(request: Request): string {
      const keyGenerator = request.keyGenerator!;
      const httpAuthSalt = request.httpAuthSalt as string;
      const key = keyGenerator.generateKey(httpAuthSalt);
      return Buffer.isBuffer(key) ? key.toString("binary") : key;
    }

    export function nonce(secretKey: string, time: number = Math.floor(Date.now() / 1000)): string {
      const t = time;
      const hashed = [t, secretKey];
      const digest = OpenSSL.Digest.MD5.hexdigest(hashed.join(":"));
      return Buffer.from(`${t}:${digest}`).toString("base64");
    }

    export function validateNonce(
      secretKey: string,
      _request: Request,
      value: string | null | undefined,
      secondsToTimeout = 5 * 60,
    ): boolean {
      if (value == null) return false;
      const t = parseInt(Buffer.from(value, "base64").toString("utf-8").split(":")[0], 10) || 0;
      return (
        nonce(secretKey, t) === value &&
        Math.abs(t - Math.floor(Date.now() / 1000)) <= secondsToTimeout
      );
    }

    export function opaque(secretKey: string): string {
      return OpenSSL.Digest.MD5.hexdigest(secretKey);
    }
  }

  export namespace Token {
    export const TOKEN_KEY = "token=";
    export const TOKEN_REGEX = /^(Token|Bearer)\s+/m;
    export const AUTHN_PAIR_DELIMITERS = /(?:,|;|\t)/;

    export namespace ControllerMethods {
      export function authenticateOrRequestWithHttpToken<T>(
        this: TokenController,
        realm = "Application",
        message: string | null | undefined,
        loginProcedure: (token: string, options: HashWithIndifferentAccess<string>) => T,
      ): unknown {
        const authenticated = this.authenticateWithHttpToken(loginProcedure);
        return authenticated != null && authenticated !== false
          ? authenticated
          : this.requestHttpTokenAuthentication(realm, message);
      }

      export function authenticateWithHttpToken<T>(
        this: TokenController,
        loginProcedure: (token: string, options: HashWithIndifferentAccess<string>) => T,
      ): T | undefined {
        return Token.authenticate(this, loginProcedure);
      }

      export function requestHttpTokenAuthentication(
        this: TokenController,
        realm = "Application",
        message: string | null | undefined = null,
      ): unknown {
        return Token.authenticationRequest(this, realm, message);
      }
    }

    export function authenticate<T>(
      controller: Metal,
      loginProcedure: (token: string, options: HashWithIndifferentAccess<string>) => T,
    ): T | undefined {
      const [token, options] = tokenAndOptions(controller.request) ?? [];
      if (!isBlank(token)) {
        return loginProcedure(token!, options!);
      }
    }

    export function tokenAndOptions(
      request: Request,
    ): [string | undefined, HashWithIndifferentAccess<string>] | undefined {
      const authorizationRequest = String(request.authorization ?? "");
      if (TOKEN_REGEX.test(authorizationRequest)) {
        const params = tokenParamsFrom(authorizationRequest);
        return [
          params.shift()![1],
          new HashWithIndifferentAccess<string>(Object.fromEntries(params)),
        ];
      }
    }

    export function tokenParamsFrom(auth: string): (string | undefined)[][] {
      return rewriteParamValues(paramsArrayFrom(rawParams(auth)));
    }

    export function paramsArrayFrom(rawParams: string[]): (string | undefined)[][] {
      return rawParams.map((param) => stringSplit(param, /=(.+)?/));
    }

    export function rewriteParamValues(
      arrayParams: (string | undefined)[][],
    ): (string | undefined)[][] {
      for (const param of arrayParams) {
        if (param[1] != null) param[1] = param[1].replace(/^"|"$/gm, "");
      }
      return arrayParams;
    }

    export function rawParams(auth: string): string[] {
      const _rawParams = stringSplit(auth.replace(TOKEN_REGEX, ""), AUTHN_PAIR_DELIMITERS)
        .map((param) => param.trim())
        .filter((param) => param.length > 0);

      if (!_rawParams[0]?.startsWith(TOKEN_KEY)) {
        _rawParams[0] = `${TOKEN_KEY}${_rawParams[0] ?? ""}`;
      }

      return _rawParams;
    }

    export function encodeCredentials(
      token: unknown,
      options: Record<string, unknown> = {},
    ): string {
      const values = [`${TOKEN_KEY}${rbInspect(String(token ?? ""))}`].concat(
        Object.entries(options).map(([key, value]) => `${key}=${rbInspect(String(value ?? ""))}`),
      );
      return `Token ${values.join(", ")}`;
    }

    export function authenticationRequest(
      controller: Metal,
      realm: string,
      message: string | null | undefined = null,
    ): unknown {
      message ??= "HTTP Token: Access denied.\n";
      controller.headers.set("WWW-Authenticate", `Token realm="${realm.replace(/"/g, "")}"`);
      return rbFSend(controller, "render", { plain: message, status: ":unauthorized" });
    }
  }
}

Object.defineProperty(HttpAuthentication.Basic.ControllerMethods, included, {
  value(base: object): void {
    extend(base, HttpAuthentication.Basic.ControllerMethods.ClassMethods);
  },
});
