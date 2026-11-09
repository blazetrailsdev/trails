import { File, classModule, getFs } from "@blazetrails/ruby-compat";

export const TRAILS_FRAMEWORK_ROOT = File.expandPath(
  decodeURIComponent(new URL("../../../../..", import.meta.url).pathname),
);

export class Paths {
  static readonly [classModule] = true;
  declare _tmpPath: string | undefined;

  appTemplatePath(): string {
    return File.join(TRAILS_FRAMEWORK_ROOT, "tmp/templates/app_template");
  }

  bootsnapCachePath(): string {
    return File.join(TRAILS_FRAMEWORK_ROOT, "tmp/templates/bootsnap");
  }

  async tmpPath(...args: string[]): Promise<string> {
    const fs = getFs();
    this._tmpPath ??= await fs.realpath!(
      await fs.mkdtemp!(`${File.join(TRAILS_FRAMEWORK_ROOT, "tmp")}/d`),
    );
    return File.join(this._tmpPath, ...args);
  }

  async appPath(): Promise<string>;
  async appPath(...args: string[]): Promise<string>;
  async appPath<T>(...args: [...string[], (path: string) => T]): Promise<T>;
  async appPath(...args: unknown[]): Promise<unknown> {
    const block = typeof args.at(-1) === "function" ? (args.pop() as (p: string) => unknown) : null;
    const path = await this.tmpPath(...["app", ...(args as string[])]);
    if (block != null) {
      return block(path);
    } else {
      return path;
    }
  }

  frameworkPath(): string {
    return TRAILS_FRAMEWORK_ROOT;
  }

  trailsRoot(): Promise<string> {
    return this.appPath();
  }
}
