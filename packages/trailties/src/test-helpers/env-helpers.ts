import { classModule, env as ENV, setEnv } from "@blazetrails/ruby-compat";
import { _resetEnv } from "../trails.js";

export class EnvHelpers {
  static readonly [classModule] = true;

  /** @internal */
  async withTrailsEnv<T>(env: string | undefined, block: () => T | Promise<T>): Promise<T> {
    _resetEnv();
    return this.switchEnv("TRAILS_ENV", env, () => this.switchEnv("NODE_ENV", undefined, block));
  }

  /** @internal */
  async withRackEnv<T>(env: string | undefined, block: () => T | Promise<T>): Promise<T> {
    _resetEnv();
    return this.switchEnv("NODE_ENV", env, () => this.switchEnv("TRAILS_ENV", undefined, block));
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
