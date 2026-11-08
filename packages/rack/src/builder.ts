import {
  ArgumentError,
  type Binding,
  capitalize,
  constGet,
  File,
  RuntimeError,
  rbBlockGivenP,
  rbFBinding,
  rbFLoad,
  rbProcCall,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { URLMap } from "./urlmap.js";
import { Rack } from "./namespaces.js";

type RackApp = { call(env: Record<string, any>): any } | ((env: Record<string, any>) => any);
type MiddlewareFactory = new (app: RackApp, ...args: any[]) => RackApp;

export const BUILDER_TOPLEVEL_BINDING = (builder: Builder): Binding => rbFBinding(builder);

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

  /** @missingRailsArgs basename — PERMANENT */
  static async parseFile(path: string, options: Record<string, unknown> = {}): Promise<RackApp> {
    if (path.endsWith(".ru")) {
      return this.loadFile(path, options);
    } else {
      await rbFLoad(path);
      return constGet(
        TopLevel,
        File.basename(path, ".*")
          .split("_")
          .map((s) => capitalize(s, []))
          .join(""),
      ) as RackApp;
    }
  }

  static loadFile(path: string, options: Record<string, unknown> = {}): RackApp {
    let config = File.read(path);
    if (config.charCodeAt(0) === 0xfeff) config = config.slice(1);

    if (/^#\\(.*)/m.test(config)) {
      throw new RuntimeError(
        `Parsing options from the first comment line is no longer supported: ${path}`,
      );
    }

    config = config.replace(/^#(?!\\)[^\n]*\n/gm, "\n");

    config = config.replace(/^__END__\n[\s\S]*(?![\s\S])/m, "");

    return this.newFromString(config, path, options);
  }

  static newFromString(
    builderScript: string,
    path = "(rackup)",
    options: Record<string, unknown> = {},
  ): RackApp {
    const builder = new this(null, options);
    const binding = rbProcCall(BUILDER_TOPLEVEL_BINDING, builder) as Binding;
    const source =
      `(function (builder, topLevel) { with (topLevel) { return (function () { "use strict"; ${builderScript}\n})(); } })` +
      `\n//# sourceURL=${path.replace(/\\/g, "/").replace(/[\r\n\u2028\u2029]/g, "")}`;
    ((0, eval)(source) as (b: Builder, topLevel: object) => void)(
      binding.receiver as Builder,
      TopLevel,
    );
    return builder.toApp();
  }

  use(middleware: any, ...args: any[]): null {
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

    return null;
  }

  run(app: RackApp): null;
  run(app: null, block: RackApp): null;
  run(app: RackApp | null, block?: RackApp): null {
    if (app && block) {
      throw new ArgumentError("Both app and block given!");
    }
    this._run = app || block!;

    return null;
  }

  map(path: string, block: (builder: Builder) => void): null {
    this._map ??= {};
    this._map[path] = block;

    return null;
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
    return rbProcCall(this.toApp(), env);
  }

  /**
   * @missingRailsName run — PERMANENT
   * @missingRailsName map — PERMANENT
   */
  toApp(): RackApp {
    let app = this._map ? this.generateMap(this._run, this._map) : this._run;
    if (!app) throw new RuntimeError("missing run or map statement");
    if (this._freezeApp) Object.freeze(app);
    app = this._use.reduceRight((a, e) => {
      const x = e(a);
      if (this._freezeApp) Object.freeze(x);
      return x;
    }, app);
    if (this._warmupBlock) rbProcCall(this._warmupBlock, app);
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

Rack.Builder = Builder;
