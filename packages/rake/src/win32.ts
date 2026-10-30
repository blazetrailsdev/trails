import { RbConfig } from "@blazetrails/ruby-compat";

export const Win32 = {
  isWindows(): boolean {
    return /(msdos|mswin|djgpp|mingw|[Ww]indows)/.test(RbConfig.CONFIG["host_os"]);
  },
};
