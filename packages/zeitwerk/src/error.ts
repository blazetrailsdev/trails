import { NameError as RubyNameError, StandardError } from "@blazetrails/ruby-compat";

export class Error extends StandardError {}

export class ReloadingDisabledError extends Error {
  constructor() {
    super("can't reload, please call loader.enable_reloading before setup");
  }
}

export class NameError extends RubyNameError {}

export class SetupRequired extends Error {
  constructor() {
    super("please, finish your configuration and call Zeitwerk::Loader#setup once all is ready");
  }
}
