/**
 * ActionController::RequestForgeryProtection
 *
 * CSRF protection error classes and strategy implementations.
 * @see https://api.rubyonrails.org/classes/ActionController/RequestForgeryProtection.html
 */

import { ActionControllerError } from "./exceptions.js";

export class InvalidAuthenticityToken extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid authenticity token");
    this.name = "InvalidAuthenticityToken";
  }
}

export class InvalidCrossOriginRequest extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid cross-origin request");
    this.name = "InvalidCrossOriginRequest";
  }
}

export interface ProtectionMethods {
  handleUnverifiedRequest(): void;
}

export class NullSessionHash {
  get(_key: string): unknown {
    return undefined;
  }
  set(_key: string, _value: unknown): void {}
  has(_key: string): boolean {
    return false;
  }
  delete(_key: string): boolean {
    return false;
  }
  clear(): void {}
  exists(): boolean {
    return false;
  }
  enabled(): boolean {
    return false;
  }
  destroy(): void {}

  [key: string]: unknown;
}

export class NullCookieJar {
  get(_key: string): undefined {
    return undefined;
  }
  set(_key: string, _value: string): void {}
  has(_key: string): boolean {
    return false;
  }
  delete(_key: string): boolean {
    return false;
  }
  get signed(): NullCookieJar {
    return this;
  }
  get encrypted(): NullCookieJar {
    return this;
  }

  [key: string]: unknown;
}

type Controller = Record<string, unknown>;

export class NullSession implements ProtectionMethods {
  private _controller: Controller;
  constructor(controller: Controller) {
    this._controller = controller;
  }
  handleUnverifiedRequest(): void {
    this._controller.session = Object.create(null);
    this._controller.cookies = new NullCookieJar();
    const flash = this._controller.flash;
    if (
      flash &&
      typeof flash === "object" &&
      typeof (flash as Record<string, unknown>).clear === "function"
    ) {
      (flash as { clear(): void }).clear();
    }
  }
}

export class ResetSession implements ProtectionMethods {
  private _controller: Controller;
  constructor(controller: Controller) {
    this._controller = controller;
  }
  handleUnverifiedRequest(): void {
    const session = this._controller.session;
    if (session && typeof session === "object") {
      for (const key of Object.keys(session as Record<string, unknown>)) {
        delete (session as Record<string, unknown>)[key];
      }
    } else {
      this._controller.session = {};
    }
  }
}

export class Exception implements ProtectionMethods {
  constructor(_controller: Controller) {}
  handleUnverifiedRequest(): void {
    throw new InvalidAuthenticityToken();
  }
}

const DEFAULT_TOKEN_KEY = "_csrf_token";

export class SessionStore {
  private _tokenKey: string;
  constructor(tokenKey: string = DEFAULT_TOKEN_KEY) {
    this._tokenKey = tokenKey;
  }
  read(session: Record<string, unknown>): string | null {
    const token = session[this._tokenKey];
    return typeof token === "string" ? token : null;
  }
  write(session: Record<string, unknown>, token: string): void {
    session[this._tokenKey] = token;
  }
}

export class CookieStore {
  private _cookieName: string;
  constructor(cookieName = "csrf_token") {
    this._cookieName = cookieName;
  }
  read(cookies: Record<string, string>): string | null {
    return cookies[this._cookieName] ?? null;
  }
  write(cookies: Record<string, string>, token: string): void {
    cookies[this._cookieName] = token;
  }
}
