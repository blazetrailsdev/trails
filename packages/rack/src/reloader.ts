import {
  Errno,
  File,
  LoadError,
  Mutex,
  Pathname,
  Thread,
  extend,
  hashDelete,
  puts,
  rbFLoad,
  rbGvGet,
  stderr as $stderr,
  uniq,
  type FsStatResult,
} from "@blazetrails/ruby-compat";

interface StatHost {
  cache: Record<string, string>;
  safeStat(
    file: string | null | false | undefined,
  ): [string, FsStatResult] | false | null | undefined;
  figurePath(file: string, paths: string[]): [string | false, FsStatResult | false];
}

export const Stat = {
  async rotation(
    this: StatHost,
    block: (found: string, mtime: Date) => unknown,
  ): Promise<unknown[]> {
    const files = uniq([
      rbGvGet("$0") as string,
      ...((rbGvGet("$LOADED_FEATURES") as string[]) ?? []),
    ]);
    const paths = uniq(["./", ...((rbGvGet("$LOAD_PATH") as string[]) ?? [])]);

    const results: unknown[] = [];
    for (const file of files) {
      if (/\.(so|bundle)$/.test(file)) continue;

      const [found, stat] = this.figurePath(file, paths);
      let mtime: Date | undefined;
      if (!(found && stat && (mtime = stat.mtime))) continue;

      this.cache[file] = found;

      const result = await block(found, mtime);
      if (result != null) results.push(result);
    }
    return results;
  },

  figurePath(
    this: StatHost,
    file: string,
    paths: string[],
  ): [string | false, FsStatResult | false] {
    let found: string | null | false | undefined = this.cache[file];
    if (!found && new Pathname(file).isAbsolute()) found = file;
    const safe = this.safeStat(found) || [];
    found = safe[0];
    const stat = safe[1];
    if (found) return [found, stat!];

    for (const possiblePath of paths) {
      const path = File.join(possiblePath, file);
      const [found, stat] = this.safeStat(path) || [];
      if (found) return [File.expandPath(found), stat!];
    }

    return [false, false];
  },

  safeStat(
    this: StatHost,
    file: string | null | false | undefined,
  ): [string, FsStatResult] | false | null | undefined {
    if (file == null || file === false) return undefined;
    try {
      const stat = File.stat(file);
      if (stat.isFile()) return [file, stat];
      return undefined;
    } catch (error) {
      if (
        error instanceof Errno.ENOENT ||
        error instanceof Errno.ENOTDIR ||
        error instanceof Errno.ESRCH
      ) {
        return hashDelete(this.cache, file) != null ? false : null;
      }
      throw error;
    }
  },
};

export class Reloader {
  static Stat = Stat;

  private app: any;
  private cooldown: number;
  private last: number;
  private cache: Record<string, string>;
  private mtimes: Record<string, Date>;
  private reloadMutex: Mutex;

  constructor(app: any, cooldown: number = 10, backend: object = Stat) {
    this.app = app;
    this.cooldown = cooldown;
    this.last = Date.now() / 1000 - cooldown;
    this.cache = {};
    this.mtimes = {};
    this.reloadMutex = new Mutex();

    extend(this, backend);
  }

  async call(env: Record<string, any>): Promise<unknown> {
    if (this.cooldown != null && Date.now() / 1000 > this.last + this.cooldown) {
      if (Thread.list().length > 1) {
        await this.reloadMutex.synchronize(() => this.reloadBang());
      } else {
        await this.reloadBang();
      }

      this.last = Date.now() / 1000;
    }

    return this.app.call(env);
  }

  async reloadBang(stderr: { write(string: string): unknown } = $stderr): Promise<unknown[]> {
    return (this as unknown as typeof Stat).rotation.call(this as never, async (file, mtime) => {
      const previousMtime = (this.mtimes[file] ??= mtime);
      if (mtime > previousMtime) return this.safeLoad(file, mtime, stderr);
      return null;
    });
  }

  async safeLoad(
    file: string,
    mtime: Date,
    stderr: { write(string: string): unknown } = $stderr,
  ): Promise<unknown> {
    try {
      await rbFLoad(file);
      puts.call(stderr, `${this.constructor.name}: reloaded \`${file}'`);
      return file;
    } catch (ex) {
      if (ex instanceof LoadError || ex instanceof SyntaxError) {
        return puts.call(stderr, ex);
      }
      throw ex;
    } finally {
      this.mtimes[file] = mtime;
    }
  }
}
