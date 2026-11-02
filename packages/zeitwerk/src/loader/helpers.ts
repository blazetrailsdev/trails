import {
  Dir,
  File,
  NameError as RubyNameError,
  TypeError,
  constDefined,
  rbInspect,
  rbObjClassname,
  rbObjRespondTo,
  rbProcCall,
} from "@blazetrails/ruby-compat";
import { NameError } from "../error.js";
import type { Loader, Logger } from "../loader.js";

const CNAME_VALIDATOR = { name: "" };

export const Helpers = {
  /** @internal */
  log(this: Loader, message: string): void {
    const logger = this.logger as Logger;
    if (rbObjRespondTo(logger, "debug")) {
      (logger as { debug(message: string): void }).debug(`Zeitwerk@${this.tag}: ${message}`);
    } else {
      rbProcCall(logger, `Zeitwerk@${this.tag}: ${message}`);
    }
  },

  /** @internal */
  async ls(
    this: Loader,
    dir: string,
    block: (basename: string, abspath: string, ftype: string) => unknown,
  ): Promise<void> {
    const children = await Dir.childrenAsync(dir);
    children.sort();

    for (const basename of children) {
      if (this.isHidden(basename)) continue;

      const abspath = File.join(dir, basename);
      if (this.isIgnoredPath(abspath)) continue;

      let ftype: string;
      if (await this.isDir(abspath)) {
        if (Object.hasOwn(this.roots, abspath)) continue;

        if (!(await this.hasAtLeastOneRubyFile(abspath))) {
          if (this.logger != null) {
            this.log(`directory ${abspath} is ignored because it has no Ruby files`);
          }
          continue;
        }

        ftype = "directory";
      } else {
        if (!(await this.isRuby(abspath))) continue;
        ftype = "file";
      }

      await block(basename.replaceAll("-", "_"), abspath, ftype);
    }
  },

  /** @internal */
  async hasAtLeastOneRubyFile(this: Loader, dir: string): Promise<boolean> {
    const toVisit = [dir];

    let next: string | undefined;
    while ((next = toVisit.shift()) !== undefined) {
      dir = next;
      for (const basename of await Dir.childrenAsync(dir)) {
        if (this.isHidden(basename)) continue;

        const abspath = File.join(dir, basename);
        if (this.isIgnoredPath(abspath)) continue;

        if (await this.isDir(abspath)) {
          if (!Object.hasOwn(this.roots, abspath)) toVisit.push(abspath);
        } else {
          if (await this.isRuby(abspath)) return true;
        }
      }
    }

    return false;
  },

  /** @internal */
  async isRuby(this: Loader, path: string): Promise<boolean> {
    if (path.endsWith(".d.ts") || /\.test\.[jt]s$/.test(path)) return false;
    if (path.endsWith(".ts")) return true;
    if (this._manifestConstants != null) return path.endsWith(".js");
    return path.endsWith(".js") && !(await File.isExistAsync(`${path.slice(0, -3)}.ts`));
  },

  /** @internal */
  isDir(this: Loader, path: string): Promise<boolean> {
    return File.isDirectoryAsync(path);
  },

  /** @internal */
  isHidden(this: Loader, basename: string): boolean {
    return basename.startsWith(".");
  },

  /** @internal */
  *walkUp(this: Loader, abspath: string): Generator<string> {
    for (;;) {
      yield abspath;
      const [dirname, basename] = File.split(abspath);
      abspath = dirname;
      if (basename === "/") break;
    }
  },

  /** @internal */
  async cnameFor(this: Loader, basename: string, abspath: string): Promise<string> {
    const cname: unknown = this.inflector.camelize(basename, abspath);
    const inflectorClass = rbObjClassname(this.inflector);

    if (typeof cname !== "string") {
      throw new TypeError(
        `${inflectorClass}#camelize must return a String, received ${rbInspect(cname)}`,
      );
    }

    if (cname.includes("::")) {
      throw new NameError(
        `wrong constant name ${cname} inferred by ${inflectorClass} from

  ${abspath}

${inflectorClass}#camelize should return a simple constant name without "::"
`,
        cname,
      );
    }

    try {
      constDefined(CNAME_VALIDATOR, cname, false);
    } catch (error) {
      if (!(error instanceof RubyNameError)) throw error;
      const pathType = (await this.isRuby(abspath)) ? "file" : "directory";

      throw new NameError(
        `${error.message} inferred by ${inflectorClass} from ${pathType}

  ${abspath}

Possible ways to address this:

  * Tell Zeitwerk to ignore this particular ${pathType}.
  * Tell Zeitwerk to ignore one of its parent directories.
  * Rename the ${pathType} to comply with the naming conventions.
  * Modify the inflector to handle this case.
`,
        error.constantName,
      );
    }

    return cname;
  },
};
