import { RuntimeError } from "@blazetrails/ruby-compat";

export class Error extends RuntimeError {
  static NotStarted: typeof NotStarted;
  static SymlinkLoop: typeof SymlinkLoop;
  static INotifyMaxWatchesExceeded: typeof INotifyMaxWatchesExceeded;
}

class NotStarted extends Error {}
class SymlinkLoop extends Error {}
class INotifyMaxWatchesExceeded extends Error {}

Error.NotStarted = NotStarted;
Error.SymlinkLoop = SymlinkLoop;
Error.INotifyMaxWatchesExceeded = INotifyMaxWatchesExceeded;
