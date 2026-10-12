import { isBlank } from "@blazetrails/activesupport";
import type { RackEnv } from "@blazetrails/rack";
import { dup, merge, mergeBang, rbEqual } from "@blazetrails/ruby-compat";

import { Request } from "../action-dispatch/http/request.js";
import type { Response } from "../action-dispatch/http/response.js";

type Env = Record<string, unknown>;

export interface RendererController {
  new (): {
    setRequestBang(request: Request): void;
    setResponseBang(response: Response): void;
    renderToString(...args: unknown[]): unknown;
  };
  _routes?: { defaultEnv(): Env } | null;
  makeResponseBang(request: Request): Response;
}

export class Renderer {
  readonly controller: RendererController;
  private _defaults: Env;
  private _env: Env;

  static readonly DEFAULTS: Env = Object.freeze({
    method: "get",
    input: "",
  });

  /** @internal */
  static normalizeEnv(env: Env): Env {
    const newEnv: Env = {};

    for (let [key, value] of Object.entries(env)) {
      switch (key) {
        case "https":
          value = value != null && value !== false ? "on" : "off";
          break;
        case "method":
          value = (value as string).toUpperCase();
          break;
      }

      key = Renderer.RACK_KEY_TRANSLATION[key] ?? key;

      newEnv[key] = value;
    }

    if (newEnv["HTTP_HOST"] != null && newEnv["HTTP_HOST"] !== false) {
      if (newEnv["HTTPS"] == null || newEnv["HTTPS"] === false) newEnv["HTTPS"] = "off";
      if (newEnv["SCRIPT_NAME"] == null || newEnv["SCRIPT_NAME"] === false) {
        newEnv["SCRIPT_NAME"] = "";
      }
    }

    if (newEnv["HTTPS"] != null && newEnv["HTTPS"] !== false) {
      newEnv["rack.url_scheme"] = newEnv["HTTPS"] === "on" ? "https" : "http";
    }

    return newEnv;
  }

  static for(
    controller: RendererController,
    env: Env | null = null,
    defaults: Env = Renderer.DEFAULTS,
  ): Renderer {
    return new this(controller, env, defaults);
  }

  new(env: Env | null = null): Renderer {
    return new (this.constructor as typeof Renderer)(this.controller, env, this._defaults);
  }

  withDefaults(defaults: Env): Renderer {
    return new (this.constructor as typeof Renderer)(
      this.controller,
      this._env,
      merge(this._defaults, defaults),
    );
  }

  constructor(controller: RendererController, env: Env | null | undefined, defaults: Env) {
    this.controller = controller;
    this._defaults = defaults;
    if (isBlank(env) && rbEqual(this._defaults, Renderer.DEFAULTS)) {
      this._env = Renderer.DEFAULT_ENV;
    } else {
      this._env = this.normalizeEnv(this._defaults);
      if (!isBlank(env)) mergeBang(this._env, this.normalizeEnv(env!));
    }
  }

  get defaults(): Env {
    if (Object.isFrozen(this._defaults)) this._defaults = dup(this._defaults);
    return this._defaults;
  }

  render(...args: unknown[]): unknown {
    const request = new Request(this.envForRequest() as RackEnv);
    request.routes = this.controller._routes;

    const instance = new this.controller();
    instance.setRequestBang(request);
    instance.setResponseBang(this.controller.makeResponseBang(request));
    return instance.renderToString(...args);
  }

  /** @internal */
  declare renderToString: Renderer["render"];

  private static RACK_KEY_TRANSLATION: Record<string, string> = {
    httpHost: "HTTP_HOST",
    https: "HTTPS",
    method: "REQUEST_METHOD",
    scriptName: "SCRIPT_NAME",
    input: "rack.input",
  };

  /** @internal */
  private static DEFAULT_ENV: Env = Object.freeze(Renderer.normalizeEnv(Renderer.DEFAULTS));

  private normalizeEnv(env: Env): Env {
    return (this.constructor as typeof Renderer).normalizeEnv(env);
  }

  private envForRequest(): Env {
    if ("HTTP_HOST" in this._env || this.controller._routes == null) {
      return dup(this._env);
    } else {
      return merge(this.controller._routes.defaultEnv(), this._env);
    }
  }
}
Renderer.prototype.renderToString = Renderer.prototype.render;
