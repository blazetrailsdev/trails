import { ArgumentError, File } from "@blazetrails/ruby-compat";
import { URLMap } from "./urlmap.js";

type RackApp = (env: Record<string, any>) => any;
type MiddlewareFactory = new (app: RackApp, ...args: any[]) => { call: RackApp };

export class Builder {
  private _middlewares: Array<{
    klass: MiddlewareFactory | ((app: RackApp) => { call: RackApp });
    args: any[];
    block?: any;
  }> = [];
  private _map: Record<string, RackApp> = {};
  private _run: RackApp | null = null;
  private _warmupBlock: ((app: RackApp) => void) | null = null;
  private _frozen = false;
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
      configFn(builder);
    } catch (err) {
      throw new Error(`Error evaluating config from ${path}: ${(err as Error).message}`, {
        cause: err,
      });
    }
    return builder.toApp();
  }

  use(middleware: any, ...args: any[]): this {
    this._middlewares.push({ klass: middleware, args });
    return this;
  }

  run(app: RackApp): this;
  run(app: null, block: RackApp): this;
  run(app: RackApp | null, block?: RackApp): this {
    if (app && block) {
      throw new ArgumentError("Both app and block given!");
    }
    this._run = block || app;
    return this;
  }

  map(path: string, block: (builder: Builder) => void): this {
    const inner = new Builder();
    block(inner);
    this._map[path] = inner.toApp();
    return this;
  }

  warmup(prc: (app: RackApp) => void): this {
    this._warmupBlock = prc;
    return this;
  }

  freezeApp(): this {
    this._frozen = true;
    return this;
  }

  static app(defaultApp: RackApp | null = null, block?: (b: Builder) => void): RackApp {
    return new this(defaultApp, {}, block).toApp();
  }

  async call(env: Record<string, any>): Promise<any> {
    return this.toApp()(env);
  }

  toApp(): RackApp {
    const app =
      Object.keys(this._map).length > 0 ? this.generateMap(this._run, this._map) : this._run;
    if (!app) throw new Error("missing run or map statement");
    let result = app;
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const { klass, args } = this._middlewares[i];
      const inner = result;
      if (typeof klass === "function" && klass.prototype && klass.prototype.call) {
        const mw = new (klass as MiddlewareFactory)(inner, ...args);
        result = (e) => mw.call(e);
      } else {
        const mw = (klass as any)(inner, ...args);
        result = (e) => mw.call(e);
      }
    }
    if (this._warmupBlock) this._warmupBlock(result);
    return result;
  }

  private generateMap(defaultApp: RackApp | null, mapping: Record<string, RackApp>): RackApp {
    const mapped: Record<string, RackApp> = defaultApp ? { "/": defaultApp } : {};
    for (const [r, b] of Object.entries(mapping)) {
      mapped[r] = b;
    }
    return (env) => new URLMap(mapped).call(env);
  }
}
