import { classModule, env as ENV, setEnv } from "@blazetrails/ruby-compat";

export class EnvHelpers {
  static readonly [classModule] = true;

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
