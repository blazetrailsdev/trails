import { Errno, File, FileUtils, Process, abort } from "@blazetrails/ruby-compat";

export class Pidfile {
  /** @internal */
  private path: string;
  /** @internal */
  private pid: number;

  constructor(path: string) {
    this.path = path;
    this.pid = Process.pid;
  }

  async setup(): Promise<void> {
    await this.checkStatus();
    await this.writeFile();
    this.setAtExitHook();
  }

  async delete(): Promise<void> {
    await this.deleteFile();
  }

  /** @internal */
  private async checkStatus(): Promise<void> {
    try {
      if (await File.isExistAsync(this.path)) {
        const existingPid = parseInt((await File.readAsync(this.path)).trim(), 10) || 0;
        if (existingPid > 0) Process.kill(0, existingPid);

        this.alreadyRunningBang();
      } else {
        await FileUtils.mkdirPAsync(File.dirname(this.path));
      }
    } catch (error) {
      if (error instanceof Errno.ESRCH) {
        await this.delete();
      } else if (error instanceof Errno.EPERM) {
        this.alreadyRunningBang();
      } else {
        throw error;
      }
    }
  }

  /** @internal */
  private async writeFile(): Promise<void> {
    while (true) {
      try {
        await File.writeAsync(this.path, this.pid.toString(), { mode: "wx" });
        return;
      } catch (error) {
        if (!(error instanceof Errno.EEXIST)) throw error;
        await this.checkStatus();
      }
    }
  }

  /**
   * @internal
   * @missingRailsCall at_exit — CONVERGEABLE ruby-compat-kernel-at-exit
   */
  private setAtExitHook(): void {}

  /** @internal */
  private async deleteFile(): Promise<void> {
    if (await File.isExistAsync(this.path)) await File.deleteAsync(this.path);
  }

  /** @internal */
  private alreadyRunningBang(): never {
    abort(`A Solid Queue supervisor is already running. Check ${this.path}`);
  }
}
