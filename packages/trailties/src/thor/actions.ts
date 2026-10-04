import {
  aryDelete,
  extend,
  fetch,
  File,
  FileUtils,
  getFs,
  Hash,
  hashDelete,
  included,
  initialize,
  mergeBang,
  Module,
  rbInspect,
  rbObjIsKindOf,
  rbObjIvarGet,
  rtest,
  toS,
} from "@blazetrails/ruby-compat";
import { TEMPLATE_EXTNAME, fromSuperclass } from "./base.js";
import { Error } from "./error.js";
import type { Basic } from "./shell/basic.js";

export interface ActionsClassHost {
  name: string;
  baseclass(): unknown;
  _sourcePaths?: string[];
  _sourceRoot?: string | null;
  sourcePaths(): string[];
  sourceRoot(path?: string): Promise<string | null | undefined>;
  classOption(name: string, options?: Record<string, unknown>): unknown;
}

type InsideBlock<T> = (destinationRoot: string) => T | Promise<T>;

export interface ActionsHost {
  behavior: string;
  /** @internal */
  _destinationStack: string[];
  destinationRoot: string;
  options: Record<string, unknown>;
  shell: Basic;
  sayStatus(status: unknown, message: unknown, logStatus?: unknown): void;
  inside: typeof inside;
  /** @internal */
  _cleanupOptionsAndSet(options: unknown[] | Record<string, unknown>, key: string): void;
  _sourcePaths?: string[];
  sourcePaths(): Promise<string[]>;
  relativeToOriginalDestinationRoot(path: string, removeDot?: boolean): string;
}

type ActionsClass = ActionsClassHost & { sourcePathsForSearch(): Promise<string[]> };

export const ClassMethods = {
  sourcePaths(this: ActionsClassHost): string[] {
    return (this._sourcePaths = (rbObjIvarGet(this, "@_source_paths") as string[] | null) || []);
  },

  async sourceRoot(this: ActionsClassHost, path: string | null = null): Promise<string | null> {
    if (path != null) this._sourceRoot = path;
    if (!Object.prototype.hasOwnProperty.call(this, "_sourceRoot")) this._sourceRoot = null;
    return this._sourceRoot ?? null;
  },

  async sourcePathsForSearch(this: ActionsClassHost): Promise<string[]> {
    let paths: string[] = [];
    paths = paths.concat(this.sourcePaths());
    const sourceRoot = await this.sourceRoot();
    if (sourceRoot != null) paths.push(sourceRoot);
    paths = paths.concat(fromSuperclass.call(this, "sourcePaths", []) as string[]);
    return paths;
  },

  addRuntimeOptionsBang(this: ActionsClassHost): void {
    this.classOption("force", {
      type: "boolean",
      aliases: "-f",
      group: "runtime",
      desc: "Overwrite files that already exist",
    });

    this.classOption("pretend", {
      type: "boolean",
      aliases: "-p",
      group: "runtime",
      desc: "Run but do not make any changes",
    });

    this.classOption("quiet", {
      type: "boolean",
      aliases: "-q",
      group: "runtime",
      desc: "Suppress status output",
    });

    this.classOption("skip", {
      type: "boolean",
      aliases: "-s",
      group: "runtime",
      desc: "Skip files that already exist",
    });
  },
};

export function action(
  this: Pick<ActionsHost, "behavior">,
  instance: { revokeBang(): unknown; invokeBang(): unknown },
): unknown {
  if (this.behavior === "revoke") {
    return instance.revokeBang();
  } else {
    return instance.invokeBang();
  }
}

function destinationRoot(this: ActionsHost): string {
  return this._destinationStack[this._destinationStack.length - 1];
}

function setDestinationRoot(this: ActionsHost, root: string | null | undefined): void {
  this._destinationStack ||= [];
  this._destinationStack[0] = File.expandPath(root || "");
}

export function relativeToOriginalDestinationRoot(
  this: Pick<ActionsHost, "_destinationStack">,
  path: string,
  removeDot: boolean = true,
): string {
  const root = this._destinationStack[0];
  if (
    path.startsWith(root) &&
    [File.SEPARATOR, File.ALT_SEPARATOR, null, ""].includes(
      path.slice(root.length, root.length + 1),
    )
  ) {
    path = "." + path.slice(root.length);
    return removeDot ? path.slice(2) : path;
  } else {
    return path;
  }
}

export async function sourcePaths(this: Pick<ActionsHost, "_sourcePaths">): Promise<string[]> {
  return (this._sourcePaths ??= await (
    this.constructor as unknown as ActionsClass
  ).sourcePathsForSearch());
}

export async function findInSourcePaths(
  this: Pick<ActionsHost, "destinationRoot" | "sourcePaths" | "relativeToOriginalDestinationRoot">,
  file: string,
): Promise<string> {
  const possibleFiles = [file, file + TEMPLATE_EXTNAME];
  const relativeRoot = this.relativeToOriginalDestinationRoot(this.destinationRoot, false);

  for (const source of await this.sourcePaths()) {
    for (const f of possibleFiles) {
      const sourceFile = File.expandPath(f, File.join(source, relativeRoot));
      if (await getFs().exists(sourceFile)) return sourceFile;
    }
  }

  let message = `Could not find ${rbInspect(file)} in any of your source paths. `;

  const klass = this.constructor as unknown as ActionsClass;
  if ((await klass.sourceRoot()) == null) {
    message += `Please invoke ${klass.name}.source_root(PATH) with the PATH containing your templates. `;
  }

  message +=
    (await this.sourcePaths()).length === 0
      ? "Currently you have no source paths."
      : `Your current source paths are: \n${(await this.sourcePaths()).join("\n")}`;

  throw new Error(message);
}

export async function inside<T>(
  this: ActionsHost,
  dir: string = "",
  config: { verbose?: unknown } | InsideBlock<T> = {},
  block?: InsideBlock<T>,
): Promise<T> {
  if (typeof config === "function") [config, block] = [{}, config];
  const verbose = fetch(config, "verbose", false);
  const pretend = this.options["pretend"];

  this.sayStatus("inside", dir, verbose);
  if (rtest(verbose)) this.shell.padding += 1;
  this._destinationStack.push(File.expandPath(dir, this.destinationRoot));

  if (!(await getFs().exists(this.destinationRoot)) && !rtest(pretend)) {
    await getFs().mkdir!(this.destinationRoot, { recursive: true });
  }

  let result: T | null = null;
  if (rtest(pretend)) {
    result = await (block!.length === 1 ? block!(this.destinationRoot) : (block as () => T)());
  } else {
    await FileUtils.cd(this.destinationRoot, async () => {
      result = await (block!.length === 1 ? block!(this.destinationRoot) : (block as () => T)());
    });
  }

  this._destinationStack.pop();
  if (rtest(verbose)) this.shell.padding -= 1;
  return result as T;
}

export function inRoot<T>(this: ActionsHost, block: () => T | Promise<T>): Promise<T> {
  return this.inside(this._destinationStack[0], () => block());
}

/** @internal */
function _sharedConfiguration(this: ActionsHost): Record<string, unknown> {
  return mergeBang(
    Actions.superMethod(this, "_sharedConfiguration")!() as Record<string, unknown>,
    { destinationRoot: this.destinationRoot },
  );
}

/** @internal */
function _cleanupOptionsAndSet(
  this: ActionsHost,
  options: unknown[] | Record<string, unknown>,
  key: string,
): void {
  if (Array.isArray(options)) {
    for (const i of ["--force", "-f", "--skip", "-s"]) aryDelete(options, i);
    options.push(`--${key}`);
  } else if (rbObjIsKindOf(options, Hash)) {
    for (const i of ["force", "skip"]) hashDelete(options, i);
    mergeBang(options, { [key]: true });
  }
}

export const Actions = new Module((mod) => {
  (mod as unknown as Record<symbol, unknown>)[included] = function (base: object): void {
    extend(base, ClassMethods);
  };

  (mod as unknown as Record<symbol, unknown>)[initialize] = function (
    this: ActionsHost,
    args: unknown[] = [],
    options: unknown[] | Record<string, unknown> = {},
    config: { behavior?: string | null; destinationRoot?: string | null } = {},
  ): void {
    this.behavior = (() => {
      switch (toS(config.behavior)) {
        case "force":
        case "skip":
          this._cleanupOptionsAndSet(options, config.behavior!);
          return "invoke";
        case "revoke":
          return "revoke";
        default:
          return "invoke";
      }
    })();

    this.destinationRoot = config.destinationRoot as string;
  };

  mod.attrReader("behavior");
  mod.attrWriter("behavior");
  mod.moduleEval((m) => {
    Object.defineProperty(m, "destinationRoot", {
      get: destinationRoot,
      set: setDestinationRoot,
      configurable: true,
    });
    Object.assign(m, {
      action,
      relativeToOriginalDestinationRoot,
      sourcePaths,
      findInSourcePaths,
      inside,
      inRoot,
      _sharedConfiguration,
      _cleanupOptionsAndSet,
    });
  });
});
