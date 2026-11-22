import { StandardError, RuntimeError, STDERR } from "@blazetrails/ruby-compat";

export type ErrorHandler = (error: Error) => void;

export class Error extends StandardError {
  static _handler: ErrorHandler | null = null;

  static readonly VERBOSE_HANDLER: ErrorHandler = (error) => {
    STDERR.write(error.toString() + "\n");
    STDERR.flush();
  };

  static readonly QUIET_HANDLER: ErrorHandler = (_error) => {};

  static getHandler(): ErrorHandler | null {
    return Error._handler;
  }

  static setHandler(block?: ErrorHandler): typeof Error {
    if (block == null) throw new RuntimeError("No block given");
    Error._handler = block;
    return this;
  }

  static resetHandler(): typeof Error {
    Error._handler = null;
    return this;
  }
}

Error.setHandler(Error.VERBOSE_HANDLER);
