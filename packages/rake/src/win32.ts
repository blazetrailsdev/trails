import { File, RbConfig, RuntimeError, env as ENV } from "@blazetrails/ruby-compat";

export class Win32HomeError extends RuntimeError {}

export const Win32 = {
  Win32HomeError,

  isWindows(): boolean {
    return /(msdos|mswin|djgpp|mingw|[Ww]indows)/.test(RbConfig.CONFIG["host_os"]);
  },

  win32SystemDir(): string {
    let win32SharedPath = ENV["HOME"];
    if (win32SharedPath == null && ENV["HOMEDRIVE"] != null && ENV["HOMEPATH"] != null) {
      win32SharedPath = ENV["HOMEDRIVE"] + ENV["HOMEPATH"];
    }

    win32SharedPath ??= ENV["APPDATA"];
    win32SharedPath ??= ENV["USERPROFILE"];
    if (win32SharedPath == null || win32SharedPath.length === 0) {
      throw new Win32HomeError("Unable to determine home path environment variable.");
    }
    return this.normalize(File.join(win32SharedPath, "Rake"));
  },

  normalize(path: string): string {
    return path.replaceAll("\\", "/");
  },
};
