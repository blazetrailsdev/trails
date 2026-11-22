import { format } from "@blazetrails/ruby-compat";
import { Error as ListenError } from "../error.js";
import { Listen } from "../logger.js";
import type { Entry } from "./entry.js";

export class SymlinkDetector {
  static readonly README_URL = "https://github.com/guard/listen/blob/master/README.md";

  static readonly SYMLINK_LOOP_ERROR = `        ** ERROR: directory is already being watched! **

        Directory: %s

        is already being watched through: %s

        MORE INFO: ${SymlinkDetector.README_URL}
`;

  static readonly Error = ListenError;

  private _realDirs = new Set<string>();

  async verifyUnwatchedBang(entry: Entry): Promise<void> {
    const realPath = await entry.realPath();
    if (this._realDirs.has(realPath)) {
      this._fail(entry.sysPath(), realPath);
    }
    this._realDirs.add(realPath);
  }

  warn(message: string): void {
    Listen.adapterWarn(message);
  }

  private _fail(symlinked: string, realPath: string): never {
    this.warn(format(SymlinkDetector.SYMLINK_LOOP_ERROR, symlinked, realPath));
    throw new ListenError.SymlinkLoop("Failed due to looped symlinks");
  }
}
