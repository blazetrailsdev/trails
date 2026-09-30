import { extend, File, getFs, included, rbInspect } from "@blazetrails/ruby-compat";
import { TEMPLATE_EXTNAME, fromSuperclass } from "./base.js";
import { Error } from "./error.js";

export interface ActionsClassHost {
  name: string;
  _sourcePaths?: string[];
  _sourceRoot?: string | null;
  sourcePaths(): string[];
  sourceRoot(path?: string): Promise<string | null | undefined>;
}

export interface ActionsHost {
  cwd: string;
  destinationRoot: string;
  _sourcePaths?: string[];
  sourcePaths(): Promise<string[]>;
  relativeToOriginalDestinationRoot(path: string, removeDot?: boolean): string;
}

type ActionsClass = ActionsClassHost & { sourcePathsForSearch(): Promise<string[]> };

export const ClassMethods = {
  sourcePaths(this: ActionsClassHost): string[] {
    if (!Object.prototype.hasOwnProperty.call(this, "_sourcePaths")) this._sourcePaths = [];
    return this._sourcePaths!;
  },

  async sourceRoot(this: ActionsClassHost, path: string | null = null): Promise<string | null> {
    if (path != null) this._sourceRoot = path;
    return (this._sourceRoot ??= null);
  },

  async sourcePathsForSearch(this: ActionsClassHost): Promise<string[]> {
    let paths: string[] = [];
    paths = paths.concat(this.sourcePaths());
    const sourceRoot = await this.sourceRoot();
    if (sourceRoot != null) paths.push(sourceRoot);
    paths = paths.concat(fromSuperclass.call(this, "sourcePaths", []) as string[]);
    return paths;
  },
};

export function relativeToOriginalDestinationRoot(
  this: Pick<ActionsHost, "cwd">,
  path: string,
  removeDot: boolean = true,
): string {
  const root = this.cwd;
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

export async function sourcePaths(this: ActionsHost): Promise<string[]> {
  return (this._sourcePaths ??= await (
    this.constructor as unknown as ActionsClass
  ).sourcePathsForSearch());
}

export async function findInSourcePaths(this: ActionsHost, file: string): Promise<string> {
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

export const Actions = {
  [included](base: object): void {
    extend(base, ClassMethods);
  },

  relativeToOriginalDestinationRoot,
  sourcePaths,
  findInSourcePaths,
};
