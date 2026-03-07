import { URLMap } from "./urlmap.js";

type RackApp = (env: Record<string, any>) => any;
type MiddlewareFactory = new (app: RackApp, ...args: any[]) => { call: RackApp };

export class Builder {
  private _middlewares: Array<{ klass: MiddlewareFactory | ((app: RackApp) => { call: RackApp }); args: any[]; block?: any }> = [];
  private _map: Record<string, RackApp> = {};
  private _run: RackApp | null = null;
  private _warmupBlock: ((app: RackApp) => void) | null = null;
  private _frozen = false;

  constructor(appOrBlock?: RackApp | ((builder: Builder) => void)) {
    if (typeof appOrBlock === "function" && appOrBlock.length === 1) {
      // Check if it's a builder block (takes builder arg) vs an app (takes env)
      // Heuristic: if it looks like it's configuring a builder, treat as block
    }
  }

  use(middleware: any, ...args: any[]): this {
    this._middlewares.push({ klass: middleware, args });
    return this;
  }

  run(app: RackApp): this;
  run(app: null, block: RackApp): this;
  run(app: RackApp | null, block?: RackApp): this {
    if (app && block) {
      throw new Error("Both app and block given to run");
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

  warmup(block: (app: RackApp) => void): this {
    this._warmupBlock = block;
    return this;
  }

  freezeApp(): this {
    this._frozen = true;
    return this;
  }

  toApp(): RackApp {
    let app = this._generateApp();
    if (this._warmupBlock) {
      this._warmupBlock(app);
    }
    return app;
  }

  private _generateApp(): RackApp {
    let app: RackApp;

    if (Object.keys(this._map).length > 0) {
      const mapping: Record<string, RackApp> = { ...this._map };
      if (this._run) {
        mapping["/"] = this._run;
      }
      app = (env) => new URLMap(mapping).call(env);
    } else if (this._run) {
      app = this._run;
    } else {
      throw new Error("missing run or map statement");
    }

    // Apply middleware in reverse order (last use = outermost)
    for (let i = this._middlewares.length - 1; i >= 0; i--) {
      const { klass, args } = this._middlewares[i];
      const inner = app;
      if (typeof klass === "function" && klass.prototype && klass.prototype.call) {
        const mw = new (klass as MiddlewareFactory)(inner, ...args);
        app = (env) => mw.call(env);
      } else {
        const mw = (klass as any)(inner, ...args);
        app = (env) => mw.call(env);
      }
    }

    return app;
  }
}
