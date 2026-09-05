import { defineModule } from "@blazetrails/activesupport";
import type { RackApp } from "@blazetrails/rack";
import { Session } from "./test.js";

/** @noRailsEquivalent PERMANENT */
export interface MethodsHost {
  app: RackApp;
  defaultHost?: string;
  buildRackMockSession?(): Session;
  /** @internal */
  _rackTestSessions?: Map<unknown, Session>;
  /** @internal */
  get _rackTestCurrentSession(): Session | undefined;
  /** @internal */
  set _rackTestCurrentSession(value: Session | undefined);
}

function rackTestSession(this: MethodsHost, name: unknown = ":default"): Session {
  if (!(name != null && name !== false)) return buildRackTestSession.call(this, name);

  this._rackTestSessions ??= new Map();
  let session = this._rackTestSessions.get(name);
  if (session == null) {
    session = buildRackTestSession.call(this, name);
    this._rackTestSessions.set(name, session);
  }
  return session;
}

const rackMockSession = rackTestSession;

function buildRackTestSession(this: MethodsHost, _name: unknown): Session {
  if ("buildRackMockSession" in this) {
    return this.buildRackMockSession!();
  } else {
    if ("defaultHost" in this) {
      return Session.new(this.app, this.defaultHost);
    } else {
      return Session.new(this.app);
    }
  }
}

function currentSession(this: MethodsHost): Session {
  return (this._rackTestCurrentSession ??= rackTestSession.call(this));
}

function withSession<T>(this: MethodsHost, name: unknown, block: (session: Session) => T): T {
  const session = this._rackTestCurrentSession;
  try {
    return block((this._rackTestCurrentSession = rackTestSession.call(this, name)));
  } finally {
    this._rackTestCurrentSession = session;
  }
}

function request(this: MethodsHost, ...args: Parameters<Session["request"]>) {
  return currentSession.call(this).request(...args);
}

function get(this: MethodsHost, ...args: Parameters<Session["get"]>) {
  return currentSession.call(this).get(...args);
}

function post(this: MethodsHost, ...args: Parameters<Session["post"]>) {
  return currentSession.call(this).post(...args);
}

function put(this: MethodsHost, ...args: Parameters<Session["put"]>) {
  return currentSession.call(this).put(...args);
}

function patch(this: MethodsHost, ...args: Parameters<Session["patch"]>) {
  return currentSession.call(this).patch(...args);
}

function _delete(this: MethodsHost, ...args: Parameters<Session["delete"]>) {
  return currentSession.call(this).delete(...args);
}

function options(this: MethodsHost, ...args: Parameters<Session["options"]>) {
  return currentSession.call(this).options(...args);
}

function head(this: MethodsHost, ...args: Parameters<Session["head"]>) {
  return currentSession.call(this).head(...args);
}

function customRequest(this: MethodsHost, ...args: Parameters<Session["customRequest"]>) {
  return currentSession.call(this).customRequest(...args);
}

function followRedirectBang(this: MethodsHost, ...args: Parameters<Session["followRedirectBang"]>) {
  return currentSession.call(this).followRedirectBang(...args);
}

function header(this: MethodsHost, ...args: Parameters<Session["header"]>) {
  return currentSession.call(this).header(...args);
}

function env(this: MethodsHost, ...args: Parameters<Session["env"]>) {
  return currentSession.call(this).env(...args);
}

function setCookie(this: MethodsHost, ...args: Parameters<Session["setCookie"]>) {
  return currentSession.call(this).setCookie(...args);
}

function clearCookies(this: MethodsHost, ...args: Parameters<Session["clearCookies"]>) {
  return currentSession.call(this).clearCookies(...args);
}

function authorize(this: MethodsHost, ...args: Parameters<Session["basicAuthorize"]>) {
  return currentSession.call(this).authorize(...args);
}

function basicAuthorize(this: MethodsHost, ...args: Parameters<Session["basicAuthorize"]>) {
  return currentSession.call(this).basicAuthorize(...args);
}

function lastResponse(this: MethodsHost, ...args: Parameters<Session["lastResponse"]>) {
  return currentSession.call(this).lastResponse(...args);
}

function lastRequest(this: MethodsHost, ...args: Parameters<Session["lastRequest"]>) {
  return currentSession.call(this).lastRequest(...args);
}

export const Methods = defineModule(
  {
    rackTestSession,
    rackMockSession,
    buildRackTestSession,
    currentSession,
    withSession,
    request,
    get,
    post,
    put,
    patch,
    delete: _delete,
    options,
    head,
    customRequest,
    followRedirectBang,
    header,
    env,
    setCookie,
    clearCookies,
    authorize,
    basicAuthorize,
    lastResponse,
    lastRequest,
  },
  {},
  {},
);
