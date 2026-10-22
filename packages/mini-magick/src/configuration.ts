import "./utilities.js";
import { Logger } from "@blazetrails/activesupport";
import { Dir, stdout as $stdout, classModule, rbModConstSet } from "@blazetrails/ruby-compat";
import { MiniMagick as MiniMagickSeat } from "./namespaces.js";

export class Configuration {
  declare _graphicsmagick: unknown;
  declare _cliPrefix: unknown;
  declare _cliEnv: unknown;
  declare _restrictedEnv: unknown;
  declare _timeout: unknown;
  declare _logger: unknown;
  declare _tmpdir: unknown;
  declare _errors: unknown;
  declare _warnings: unknown;

  static readonly [classModule] = true;

  static toString(): string {
    return "MiniMagick::Configuration";
  }

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

  static extended(base: Record<string, unknown>) {
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

  configure(this: unknown, block?: (...args: unknown[]) => unknown) {
    return block(this);
  }
}
rbModConstSet(MiniMagickSeat, "Configuration", Configuration);
