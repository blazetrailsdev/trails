/**
 * ActionController::Renderer
 *
 * Renders json, plain text, or HTML outside of controller actions.
 * Returns the rendered body string, matching Rails' Renderer#render.
 * Template/partial rendering requires integration with LookupContext.
 * @see https://api.rubyonrails.org/classes/ActionController/Renderer.html
 */

import { Metal } from "./metal.js";

interface RoutesLike {
  defaultEnv?: Record<string, unknown>;
}

export class Renderer {
  private _controller: unknown;
  private _defaults: Record<string, unknown>;
  private _env: Record<string, unknown>;
  private _lastStatus: number = 200;
  private _lastContentType: string = "text/html; charset=utf-8";

  constructor(
    controller: unknown,
    env: Record<string, unknown> | null | undefined,
    defaults: Record<string, unknown> = {},
  ) {
    this._controller = controller;
    this._defaults = defaults;
    this._env = Renderer.normalizeEnv(defaults);
    if (env) Object.assign(this._env, Renderer.normalizeEnv(env));
  }

  static for(
    controller: unknown,
    env: Record<string, unknown> | null = null,
    defaults: Record<string, unknown> = {},
  ): Renderer {
    return new Renderer(controller, env, defaults);
  }

  /** Derive a new Renderer with the given Rack env (Rails: Renderer#new). */
  new(env: Record<string, unknown> | null = null): Renderer {
    return new Renderer(this._controller, env, this._defaults);
  }

  render(options: Record<string, unknown> = {}): string {
    const merged = { ...this._defaults, ...options };
    this._lastStatus =
      merged.status !== undefined && merged.status !== null
        ? Metal.resolveStatus(merged.status as number | string)
        : 200;
    const explicitContentType =
      (merged.contentType as string | undefined) ?? (merged.content_type as string | undefined);

    if (merged.json !== undefined) {
      this._lastContentType = explicitContentType ?? "application/json; charset=utf-8";
      return typeof merged.json === "string"
        ? merged.json
        : (JSON.stringify(merged.json) ?? "null");
    }
    if (merged.plain !== undefined) {
      this._lastContentType = explicitContentType ?? "text/plain; charset=utf-8";
      return String(merged.plain);
    }
    if (merged.html !== undefined) {
      this._lastContentType = explicitContentType ?? "text/html; charset=utf-8";
      return String(merged.html);
    }

    this._lastContentType = explicitContentType ?? "text/html; charset=utf-8";
    return "";
  }

  get status(): number {
    return this._lastStatus;
  }

  get contentType(): string {
    return this._lastContentType;
  }

  get defaults(): Record<string, unknown> {
    return { ...this._defaults };
  }

  get controller(): unknown {
    return this._controller;
  }

  /** The normalized Rack env that would be passed to a request. */
  get env(): Record<string, unknown> {
    return this.envForRequest();
  }

  withDefaults(defaults: Record<string, unknown>): Renderer {
    return new Renderer(this._controller, this._env, { ...this._defaults, ...defaults });
  }

  renderToString(options: Record<string, unknown> = {}): string {
    return this.render(options);
  }

  /**
   * Build the Rack env for a request. Mirrors Rails:
   *   env_for_request: if @env has HTTP_HOST or controller has no routes,
   *   return a copy of @env; otherwise merge @env on top of the routes'
   *   default_env so explicit overrides win.
   */
  private envForRequest(): Record<string, unknown> {
    const routes = (this._controller as { _routes?: RoutesLike | null } | null | undefined)
      ?._routes;
    if ("HTTP_HOST" in this._env || !routes) {
      return { ...this._env };
    }
    return { ...(routes.defaultEnv ?? {}), ...this._env };
  }

  private static RACK_KEY_TRANSLATION: Record<string, string> = {
    http_host: "HTTP_HOST",
    https: "HTTPS",
    method: "REQUEST_METHOD",
    script_name: "SCRIPT_NAME",
    input: "rack.input",
  };

  static normalizeEnv(env: Record<string, unknown>): Record<string, unknown> {
    const newEnv: Record<string, unknown> = {};

    for (const [key, rawValue] of Object.entries(env)) {
      let value = rawValue;
      if (key === "https") {
        value = value ? "on" : "off";
      } else if (key === "method") {
        value = String(value).toUpperCase();
      }

      const rackKey = this.RACK_KEY_TRANSLATION[key] ?? key;
      newEnv[rackKey] = value;
    }

    if (newEnv["HTTP_HOST"]) {
      newEnv["HTTPS"] ??= "off";
      newEnv["SCRIPT_NAME"] ??= "";
    }

    if (newEnv["HTTPS"]) {
      newEnv["rack.url_scheme"] = newEnv["HTTPS"] === "on" ? "https" : "http";
    }

    return newEnv;
  }
}
