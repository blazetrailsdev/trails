import { autoloadGet } from "../core-ext/kernel.js";
import { File, isModuleObject, rbInspect, type Pathname } from "@blazetrails/ruby-compat";
import { Cref } from "../cref.js";
import { Error as ZeitwerkError, SetupRequired } from "../error.js";
import type { Loader } from "../loader.js";
import { Registry } from "../registry.js";

export const EagerLoad = {
  async eagerLoad(this: Loader, { force = false }: { force?: boolean } = {}): Promise<void> {
    await this.mutex.synchronize(async () => {
      if (this._eagerLoaded) return;
      if (!this._setup) throw new SetupRequired();

      if (this.logger != null) this.log("eager load start");

      const roots = await this.actualRoots();
      for (const [rootDir, rootNamespace] of Object.entries(roots)) {
        await this.actualEagerLoadDir(rootDir, rootNamespace, { force });
      }

      for (const autoloadedDir of this.autoloadedDirs) {
        Registry.unregisterAutoload(autoloadedDir);
      }
      this.autoloadedDirs.length = 0;

      this._eagerLoaded = true;

      if (this.logger != null) this.log("eager load end");
    });
  },

  /** @inventedArm replaceAll — PERMANENT */
  async eagerLoadDir(this: Loader, path: string | Pathname): Promise<void> {
    if (!this._setup) throw new SetupRequired();

    path = path.toString();
    const abspath = File.expandPath(path);

    if (!(await this.isDir(abspath))) throw new ZeitwerkError(`${abspath} is not a directory`);

    const cnames: string[] = [];

    let rootNamespace: object | null = null;
    for (const dir of this.walkUp(abspath)) {
      if (this.isIgnoredPath(dir)) return;
      if (this.eagerLoadExclusions.has(dir)) return;

      rootNamespace = this.roots[dir] ?? null;
      if (rootNamespace != null) break;

      let basename = File.basename(dir);
      if (this.isHidden(basename)) return;

      if (!this.isCollapse(dir)) {
        basename = basename.replaceAll("-", "_");
        cnames.push(this.inflector.camelize(basename, dir));
      }
    }

    if (rootNamespace == null) throw new ZeitwerkError(`I do not manage ${abspath}`);

    if (this._eagerLoaded) return;

    let namespace: object = rootNamespace;
    for (const cname of cnames.reverse()) {
      const cref = new Cref(namespace, cname);
      if (!cref.isDefined()) return;
      namespace = (await autoloadGet(cref)) as object;
    }

    await this.actualEagerLoadDir(abspath, namespace);
  },

  async eagerLoadNamespace(this: Loader, mod: object): Promise<void> {
    if (!this._setup) throw new SetupRequired();

    if (typeof mod !== "function" && !(typeof mod === "object" && isModuleObject(mod))) {
      throw new ZeitwerkError(`${rbInspect(mod)} is not a class or module object`);
    }

    if (this._eagerLoaded) return;

    const modName = this.realModName(mod);
    if (modName == null) return;

    const roots = await this.actualRoots();
    for (const [rootDir, rootNamespace] of Object.entries(roots)) {
      if (Object === mod) {
        await this.actualEagerLoadDir(rootDir, rootNamespace);
      } else if (rootNamespace === Object) {
        await this.eagerLoadChildNamespace(mod, modName, rootDir, rootNamespace);
      } else {
        const rootNamespaceName = this.realModName(rootNamespace)!;
        if (rootNamespaceName.startsWith(`${modName}::`)) {
          await this.actualEagerLoadDir(rootDir, rootNamespace);
        } else if (modName === rootNamespaceName) {
          await this.actualEagerLoadDir(rootDir, rootNamespace);
        } else if (modName.startsWith(`${rootNamespaceName}::`)) {
          await this.eagerLoadChildNamespace(mod, modName, rootDir, rootNamespace);
        }
      }
    }
  },

  /**
   * @missingRailsArgs basename — PERMANENT
   * @inventedArm replaceAll — PERMANENT
   */
  async loadFile(this: Loader, path: string | Pathname): Promise<unknown> {
    path = path.toString();
    const abspath = File.expandPath(path);

    if (!(await File.isExistAsync(abspath))) throw new ZeitwerkError(`${abspath} does not exist`);
    if ((await this.isDir(abspath)) || !(await this.isRuby(abspath))) {
      throw new ZeitwerkError(`${abspath} is not a Ruby file`);
    }
    if (this.isIgnoredPath(abspath)) throw new ZeitwerkError(`${abspath} is ignored`);

    let basename = File.basename(abspath, ".*");
    if (this.isHidden(basename)) throw new ZeitwerkError(`${abspath} is ignored`);

    basename = basename.replaceAll("-", "_");
    const baseCname = this.inflector.camelize(basename, abspath);

    let rootNamespace: object | null = null;
    const cnames: string[] = [];

    for (const dir of this.walkUp(File.dirname(abspath))) {
      if (this.isIgnoredPath(dir)) throw new ZeitwerkError(`${abspath} is ignored`);

      rootNamespace = this.roots[dir] ?? null;
      if (rootNamespace != null) break;

      basename = File.basename(dir);
      if (this.isHidden(basename)) throw new ZeitwerkError(`${abspath} is ignored`);

      if (!this.isCollapse(dir)) {
        basename = basename.replaceAll("-", "_");
        cnames.push(this.inflector.camelize(basename, dir));
      }
    }

    if (rootNamespace == null) throw new ZeitwerkError(`I do not manage ${abspath}`);

    let namespace: object = rootNamespace;
    for (const cname of cnames.reverse()) {
      namespace = (await autoloadGet(new Cref(namespace, cname))) as object;
    }

    if (this.isShadowedFile(abspath)) throw new ZeitwerkError(`${abspath} is shadowed`);

    return autoloadGet(new Cref(namespace, baseCname));
  },

  /** @internal */
  async actualEagerLoadDir(
    this: Loader,
    dir: string,
    namespace: object,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    const honourExclusions = !force;
    if (honourExclusions && this.isExcludedFromEagerLoad(dir)) return;

    if (this.logger != null) this.log(`eager load directory ${dir} start`);

    const queue: [string, object][] = [[dir, namespace]];
    let next: [string, object] | undefined;
    while ((next = queue.shift()) !== undefined) {
      const currentDir = next[0];
      namespace = next[1];
      const currentNamespace = namespace;
      await this.ls(currentDir, async (basename, abspath, ftype) => {
        if (honourExclusions && this.eagerLoadExclusions.has(abspath)) return;

        if (ftype === "file") {
          const cref = this.autoloads[abspath];
          if (cref != null) await autoloadGet(cref);
        } else {
          if (this.isCollapse(abspath)) {
            queue.push([abspath, currentNamespace]);
          } else {
            const cname = this.inflector.camelize(basename, abspath);
            const cref = new Cref(currentNamespace, cname);
            queue.push([abspath, (await autoloadGet(cref)) as object]);
          }
        }
      });
    }

    if (this.logger != null) this.log(`eager load directory ${dir} end`);
  },

  /** @internal */
  async eagerLoadChildNamespace(
    this: Loader,
    child: object,
    childName: string,
    rootDir: string,
    rootNamespace: object,
  ): Promise<void> {
    let suffix = childName;
    if (rootNamespace !== Object) {
      const prefix = `${this.realModName(rootNamespace)}::`;
      if (suffix.startsWith(prefix)) suffix = suffix.slice(prefix.length);
    }

    let dirs = [rootDir];
    const nextDirs: string[] = [];

    for (const segment of suffix.split("::")) {
      let dir: string | undefined;
      while ((dir = dirs.shift()) !== undefined) {
        await this.ls(dir, (basename, abspath, ftype) => {
          if (ftype !== "directory") return;

          if (this.isCollapse(abspath)) {
            dirs.push(abspath);
          } else if (segment === this.inflector.camelize(basename, abspath)) {
            nextDirs.push(abspath);
          }
        });
      }

      if (nextDirs.length === 0) return;

      dirs = [...nextDirs];
      nextDirs.length = 0;
    }

    for (const dir of dirs) await this.actualEagerLoadDir(dir, child);
  },
};
