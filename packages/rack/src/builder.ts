import { ArgumentError, File, rbBlockGivenP, rbFBinding, rbFSend } from "@blazetrails/ruby-compat";
import { URLMap } from "./urlmap.js";

type RackApp = { call(env: Record<string, any>): any } | ((env: Record<string, any>) => any);
type MiddlewareFactory = new (app: RackApp, ...args: any[]) => RackApp;

export const BUILDER_TOPLEVEL_BINDING = (builder: Builder): Builder => rbFBinding(builder);

export class Builder {
  private _use: Array<(app: RackApp) => RackApp> = [];
  private _map: Record<string, (builder: Builder) => void> | null = null;
  private _run: RackApp | null = null;
  private _warmupBlock: ((app: RackApp) => void) | null = null;
  private _freezeApp = false;
  readonly options: Record<string, unknown>;

  constructor(
    defaultApp: RackApp | null = null,
    options: Record<string, unknown> = {},
    block?: (builder: Builder) => void,
  ) {
    this._run = defaultApp;
    this.options = options;

    if (block) block(this);
  }

  /** @missingRailsCall map — CONVERGEABLE rack-builder-parse-file-ru-guard-and-require-arm */
  static parseFile(path: string, options: Record<string, unknown> = {}): RackApp {
    return this.loadFile(path, options);
  }

  static loadFile(path: string, options: Record<string, unknown> = {}): RackApp {
    let config = File.read(path);
    if (config.charCodeAt(0) === 0xfeff) config = config.slice(1);

    if (/^#\\(.*)/m.test(config)) {
      throw new Error(
        `Parsing options from the first comment line is no longer supported: ${path}`,
      );
    }

    config = config.replace(/^#(?!\\)[^\n]*\n/gm, "\n");

    const endMatch = config.match(/^__END__\s*$/m);
    if (endMatch && typeof endMatch.index === "number") {
      config = config.substring(0, endMatch.index);
    }

    return this.newFromString(config, path, options);
  }

  static newFromString(
    builderScript: string,
    path = "(rackup)",
    options: Record<string, unknown> = {},
  ): RackApp {
    const builder = new this(null, options);
    const binding = rbFSend(BUILDER_TOPLEVEL_BINDING, "call", builder) as Builder;
    const source =
      `"use strict";\n${builderScript}` +
      `\n//# sourceURL=${path.replace(/\\/g, "/").replace(/[\r\n\u2028\u2029]/g, "")}`;
    let configFn: (b: Builder) => void;
    try {
      configFn = new Function("builder", source) as (b: Builder) => void;
    } catch (err) {
      throw new Error(`Error parsing config from ${path}: ${(err as Error).message}`, {
        cause: err,
      });
    }
    try {
      configFn(binding);
    } catch (err) {
      throw new Error(`Error evaluating config from ${path}: ${(err as Error).message}`, {
        cause: err,
      });
    }
    return builder.toApp();
  }

  use(middleware: any, ...args: any[]): this {
    const block = rbBlockGivenP(args[args.length - 1]) ? args.pop() : undefined;
    if (this._map) {
      const mapping = this._map;
      this._map = null;
      this._use.push((app) => this.generateMap(app, mapping));
    }
    this._use.push((app) =>
      typeof middleware === "function" && middleware.prototype && middleware.prototype.call
        ? new (middleware as MiddlewareFactory)(app, ...args, ...(block ? [block] : []))
        : (middleware as (app: RackApp, ...args: any[]) => RackApp)(
            app,
            ...args,
            ...(block ? [block] : []),
          ),
    );
    return this;
  }

  run(app: RackApp): this;
  run(app: null, block: RackApp): this;
  run(app: RackApp | null, block?: RackApp): this {
    if (app && block) {
      throw new ArgumentError("Both app and block given!");
    }
    this._run = app || block!;
    return this;
  }

  map(path: string, block: (builder: Builder) => void): this {
    this._map ??= {};
    this._map[path] = block;
    return this;
  }

  warmup(prc: (app: RackApp) => void): this {
    this._warmupBlock = prc;
    return this;
  }

  freezeApp(): this {
    this._freezeApp = true;
    return this;
  }

  static app(defaultApp: RackApp | null = null, block?: (b: Builder) => void): RackApp {
    return new this(defaultApp, {}, block).toApp();
  }

  async call(env: Record<string, any>): Promise<any> {
    return rbFSend(this.toApp(), "call", env);
  }

  /**
   * @missingRailsName run — PERMANENT
   * @missingRailsName map — PERMANENT
   */
  toApp(): RackApp {
    let app = this._map ? this.generateMap(this._run, this._map) : this._run;
    if (!app) throw new Error("missing run or map statement");
    if (this._freezeApp) Object.freeze(app);
    app = this._use.reduceRight((a, e) => {
      const x = e(a);
      if (this._freezeApp) Object.freeze(x);
      return x;
    }, app);
    if (this._warmupBlock) rbFSend(this._warmupBlock, "call", app);
    return app;
  }

  private generateMap(
    defaultApp: RackApp | null,
    mapping: Record<string, (builder: Builder) => void>,
  ): RackApp {
    const mapped: Record<string, RackApp> = defaultApp ? { "/": defaultApp } : {};
    for (const [r, b] of Object.entries(mapping)) {
      mapped[r] = new (this.constructor as typeof Builder)(defaultApp, {}, b).toApp();
    }
    return new URLMap(mapped);
  }
}
