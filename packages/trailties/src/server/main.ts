import { Dir, argv, getFs, getPath } from "@blazetrails/ruby-compat";
import { setAppPath } from "../app-path.js";
import { serve, type ServeOptions } from "./boot.js";

/** @noRailsEquivalent PERMANENT */
export function parseArgs(args: readonly string[]): ServeOptions {
  const options: ServeOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [flag, inline] = splitInline(arg);
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = args[++i];
      if (next === undefined) throw new Error(`trails-server: ${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "-p":
      case "--port":
        options.port = value();
        break;
      case "-b":
      case "--binding":
        options.binding = value();
        break;
      case "-e":
      case "--environment":
        options.environment = value();
        break;
      default:
        throw new Error(`trails-server: unknown argument ${arg}`);
    }
  }

  return options;
}

/** @internal */
function splitInline(arg: string): [string, string?] {
  if (!arg.startsWith("--")) return [arg, undefined];
  const at = arg.indexOf("=");

  return at === -1 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
}

/** @noRailsEquivalent PERMANENT */
export async function main(args: readonly string[]): Promise<void> {
  const root = Dir.pwd();
  const fs = getFs();
  const p = getPath();
  for (const candidate of [
    p.join(root, "dist", "config", "application.js"),
    p.join(root, "config", "application.ts"),
  ]) {
    if (await fs.exists(candidate)) {
      setAppPath(candidate);
      break;
    }
  }

  await serve(parseArgs(args));
}

/** @noRailsEquivalent PERMANENT */
export function binArgs(): readonly string[] {
  return argv.slice(2);
}
