import { toEnum, type Enumerator } from "@blazetrails/ruby-compat";
import { Record } from "../record.js";

export class Single {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  withEach<T>(block?: () => T): T | Enumerator {
    if (!block) return toEnum(this, "withEach");

    return this.with(this.name, block);
  }

  with<T>(name: string, block: () => T): T {
    return Record.withShard(name, block);
  }

  withConnectionFor<T>(_key: unknown, block: () => T): T {
    return this.with(this.name, block);
  }

  assign<K>(keys: K[]): Map<string, K[]> {
    return new Map([[this.name, keys]]);
  }

  count(): number {
    return 1;
  }

  get names(): string[] {
    return [this.name];
  }
}
