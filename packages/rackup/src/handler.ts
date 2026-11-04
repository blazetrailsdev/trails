import {
  classModule,
  env,
  LoadError,
  NameError,
  rbConstGet,
  rbFRequire,
  warn,
} from "@blazetrails/ruby-compat";

export class Handler {
  /** @noRailsEquivalent PERMANENT */
  declare static Node: typeof import("./handler/node.js").Node;

  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  /** @internal */
  static _handlers: Record<string, unknown> = {};

  /** @noRailsEquivalent PERMANENT */
  static loadPath: Record<string, (() => Promise<unknown>) | undefined> = {
    "rackup/handler/node": () => import("./handler/node.js"),
  };

  static register(name: string, klass: unknown): void {
    if (typeof klass === "string") {
      warn(
        "Calling Rackup::Handler.register with a string is deprecated, use the class/module itself.",
        { uplevel: 1 },
      );

      klass = rbConstGet(this, klass, true, false);
    }

    this._handlers[name] = klass;
  }

  static aref(name: string): unknown {
    try {
      return (
        (Object.hasOwn(this._handlers, name) ? this._handlers[name] : null) ??
        rbConstGet(this, name, true, false)
      );
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      return null;
    }
  }

  static async get(name: string | null | undefined): Promise<unknown> {
    if (name == null) return null;

    const server = this.aref(name);
    if (server != null) {
      return server;
    }

    try {
      await this.requireHandler("rackup/handler", name);
    } catch (error) {
      if (!(error instanceof LoadError)) throw error;
      await this.requireHandler("rack/handler", name);
    }

    return this.aref(name);
  }

  static readonly RACK_HANDLER = "RACK_HANDLER";
  static readonly RACKUP_HANDLER = "RACKUP_HANDLER";

  /** @internal */
  static readonly SERVER_NAMES = Object.freeze(["puma", "falcon", "webrick"]);

  static async pick(serverNames: string | string[]): Promise<unknown> {
    serverNames = Array.isArray(serverNames) ? serverNames : [serverNames];

    for (const serverName of serverNames) {
      try {
        const server = await this.get(serverName);
        if (server != null) return server;
      } catch (error) {
        if (!(error instanceof LoadError)) throw error;
      }
    }

    throw new LoadError(`Couldn't find handler for: ${serverNames.join(", ")}.`);
  }

  static async default(): Promise<unknown> {
    let rackHandler: string | undefined;
    if ((rackHandler = env[Handler.RACKUP_HANDLER]) != null) {
      return this.get(rackHandler);
    } else if ((rackHandler = env[Handler.RACK_HANDLER]) != null) {
      warn("RACK_HANDLER is deprecated, use RACKUP_HANDLER.");
      return this.get(rackHandler);
    } else {
      return this.pick([...Handler.SERVER_NAMES]);
    }
  }

  static async requireHandler(prefix: string, constName: string): Promise<boolean> {
    const file = constName
      .replace(/^[A-Z]+/, (pre) => pre.toLowerCase())
      .replace(/[A-Z]+[^A-Z]/g, "_$&")
      .toLowerCase();

    return rbFRequire(this.loadPath, `${prefix}/${file}`);
  }
}
