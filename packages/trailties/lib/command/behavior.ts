import {
  Dir,
  File,
  LOAD_PATH,
  LoadError,
  loadIseqEval,
  regexpEscape,
} from "@blazetrails/ruby-compat";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";
import type { Base } from "./base.js";
import { commandType, fileLookupPaths, lookupPaths } from "../command.js";

const EXTENSION = /\.[cm]?[tj]s$/.exec(import.meta.url)![0];
const FRAMEWORK_LIB = File.expandPath(decodeURIComponent(new URL("..", import.meta.url).pathname));
if (!LOAD_PATH.includes(FRAMEWORK_LIB)) LOAD_PATH.push(FRAMEWORK_LIB);

export function noColorBang(): void {
  ThorBase.shell = Basic;
}

let _subclasses: (typeof Base)[] | undefined;

export function subclasses(): (typeof Base)[] {
  return (_subclasses ??= []);
}

/** @internal */
export async function lookup(namespaces: string[]): Promise<void> {
  const paths = namespacesToPaths(namespaces);

  for (const rawPath of paths) {
    for (const base of lookupPaths()) {
      /** @inventedArm replace — PERMANENT */
      const path = `${base}/${rawPath}-${commandType()}`.replace(
        /^((?:trails\/)?commands)\/([^/]+)\/\2-command$/,
        "$1/$2",
      );

      try {
        let found: string | undefined;
        for (const dir of LOAD_PATH) {
          const full = File.join(dir, `${path}${EXTENSION}`);
          if (await File.isExistAsync(full)) {
            found = full;
            break;
          }
        }
        if (found === undefined) throw new LoadError(`cannot load such file -- ${path}`);
        await loadIseqEval(found);
        return;
      } catch (e) {
        if (e instanceof LoadError) {
          if (!new RegExp(`${regexpEscape(path)}$`).test(e.message)) throw e;
        } else {
          const error = e as Error;
          console.warn(
            `[WARNING] Could not load ${commandType()} ${JSON.stringify(path)}. Error: ${error.message}.\n${error.stack}`,
          );
        }
      }
    }
  }
}

/**
 * @internal
 * @inventedArm if — PERMANENT
 */
export async function lookupBang(): Promise<void> {
  for (const base of LOAD_PATH) {
    for (const path of await Dir.globAsync(File.join(base, ...fileLookupPaths()))) {
      if (/\.(d|test)\.[tj]s$/.test(path)) continue;
      try {
        await loadIseqEval(path);
      } catch {
        continue;
      }
    }
  }
}

/** @internal */
function namespacesToPaths(namespaces: string[]): string[] {
  const paths: string[] = [];
  for (const namespace of namespaces) {
    const pieces = namespace.split(":");
    const path = pieces.join("/");
    paths.push(`${path}/${pieces.at(-1)}`);
    paths.push(path);
  }
  return [...new Set(paths)];
}
