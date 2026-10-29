import { Logger } from "@blazetrails/ruby-compat";
import { Dir, stdout as $stdout, classModule, extended } from "@blazetrails/ruby-compat";

export class Configuration {
  declare _graphicsmagick: unknown;
  declare _cliPrefix: unknown;
  declare _cliEnv: unknown;
  declare _restrictedEnv: unknown;
  declare _timeout: unknown;
  declare _logger: Logger | null;
  declare _tmpdir: string | null;
  declare _errors: unknown;
  declare _warnings: unknown;

  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;
  get graphicsmagick() {
    return this._graphicsmagick ?? null;
  }

  set graphicsmagick(value) {
    this._graphicsmagick = value;
  }

  get cliPrefix() {
    return this._cliPrefix ?? null;
  }

  set cliPrefix(value) {
    this._cliPrefix = value;
  }

  get cliEnv() {
    return this._cliEnv ?? null;
  }

  set cliEnv(value) {
    this._cliEnv = value;
  }

  get restrictedEnv() {
    return this._restrictedEnv ?? null;
  }

  set restrictedEnv(value) {
    this._restrictedEnv = value;
  }

  get timeout() {
    return this._timeout ?? null;
  }

  set timeout(value) {
    this._timeout = value;
  }

  get logger() {
    return this._logger ?? null;
  }

  set logger(value) {
    this._logger = value;
  }

  get tmpdir() {
    return this._tmpdir ?? null;
  }

  set tmpdir(value) {
    this._tmpdir = value;
  }

  get errors() {
    return this._errors ?? null;
  }

  set errors(value) {
    this._errors = value;
  }

  get warnings() {
    return this._warnings ?? null;
  }

  set warnings(value) {
    this._warnings = value;
  }

  static [extended](base: Record<string, unknown>) {
    base.tmpdir = Dir.tmpdir();
    base.errors = true;
    base.logger = ((l) => {
      l.level = Logger.INFO;
      return l;
    })(new Logger($stdout));
    base.warnings = true;
    base.cliEnv = Object.freeze({});
    base.restrictedEnv = false;
    base.graphicsmagick = false;
    return base.graphicsmagick;
  }

  configure<T>(this: T, block: (config: T) => unknown) {
    return block(this);
  }
}
