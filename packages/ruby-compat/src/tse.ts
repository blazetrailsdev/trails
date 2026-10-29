import { LoadError } from "./load-error.js";

/** @noRailsEquivalent PERMANENT */
export interface TSECompiler {
  putCmd?: string;
  insertCmd?: string;
  preCmd?: string[];
  postCmd?: string[];
}

type Compiled = { default: (this: object) => string };

let loads = 0;

/**
 * Ruby's `ERB` (`vendor/ruby/v3.3.11/lib/erb.rb:335`). `@src` is compiled at build
 * time by `trails-tsc-views build-templates`, not by `ERB::Compiler`, because
 * trails has no eval pipeline (CLAUDE.md § "Templates are precompiled"); the
 * commands `setEoutvar` writes are therefore not read back.
 *
 * @noRailsEquivalent PERMANENT
 */
export class TSE {
  /** @noRailsEquivalent PERMANENT */
  src: string;
  /** @noRailsEquivalent PERMANENT */
  filename: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  lineno = 0;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    str: string,
    { trimMode = null, eoutvar = "_erbout" }: { trimMode?: string | null; eoutvar?: string } = {},
  ) {
    const compiler: TSECompiler & { trimMode: string | null } = { trimMode };
    this.setEoutvar(compiler, eoutvar);
    this.src = str;
  }

  /** @noRailsEquivalent PERMANENT */
  setEoutvar(compiler: TSECompiler, eoutvar: string = "_erbout"): void {
    compiler.putCmd = `${eoutvar}.<<`;
    compiler.insertCmd = `${eoutvar}.<<`;
    compiler.preCmd = [`${eoutvar} = +''`];
    compiler.postCmd = [eoutvar];
  }

  /**
   * `ERB#result` (`vendor/ruby/v3.3.11/lib/erb.rb:425-430`) evals `@src` in
   * `b`; here the precompiled module's default export runs with `this` bound
   * to `b`.
   *
   * @noRailsEquivalent PERMANENT
   */
  async result(b: object): Promise<string> {
    if (this.filename == null) throw new LoadError("cannot load such file -- (erb)");
    const compiled = `${this.filename}.js`;
    const url = new URL(compiled.replace(/[%#?]/g, encodeURIComponent), "file:///");
    url.search = `?${(loads += 1)}`;
    let mod: Compiled;
    try {
      mod = (await import(url.href)) as Compiled;
    } catch (error) {
      if (
        (error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND" ||
        !(error as Error).message.includes(compiled)
      ) {
        throw error;
      }
      throw new LoadError(`cannot load such file -- ${compiled}`);
    }
    return mod.default.call(b);
  }
}
