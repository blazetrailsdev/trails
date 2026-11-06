import { classModule, env as ENV, setEnv } from "@blazetrails/ruby-compat";
import { _resetTrailsEnv } from "../trails.js";

export class EnvHelpers {
  static readonly [classModule] = true;

  /** @internal */
  withTrailsEnv<T>(env: string | undefined, block: () => T | Promise<T>): Promise<T> {
    _resetTrailsEnv();
    return this.switchEnv("TRAILS_ENV", env, () => this.switchEnv("RACK_ENV", undefined, block));
  }

  /** @internal */
  withRackEnv<T>(env: string | undefined, block: () => T | Promise<T>): Promise<T> {
    _resetTrailsEnv();
    return this.switchEnv("RACK_ENV", env, () => this.switchEnv("TRAILS_ENV", undefined, block));
  }

  /** @internal */
  async switchEnv<T>(
    key: string,
    value: string | undefined,
    block: () => T | Promise<T>,
  ): Promise<T> {
    const old = ENV[key];
    setEnv(key, value);
    try {
      return await block();
    } finally {
      setEnv(key, old);
    }
  }
}
