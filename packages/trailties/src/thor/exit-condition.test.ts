import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Errno,
  extend,
  getProcessAdapter,
  include,
  initializeIncludedModules,
  SystemExit,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass, ClassMethods } from "./base.js";
import { Command } from "./command.js";

type ThorClass = BaseClass & {
  new (...args: unknown[]): object;
  usage?: string | null;
  description?: string | null;
  desc(usage: string, description: string): void;
};

class Thor {
  static usage?: string | null;
  static description?: string | null;

  static baseclass(): unknown {
    return Thor;
  }

  static desc(this: ThorClass, usage: string, description: string): void {
    this.usage = usage;
    this.description = description;
  }

  static createCommand(this: ThorClass, meth: string): boolean {
    this.commands()[meth] = new Command(
      meth,
      this.description ?? null,
      null,
      null,
      this.usage ?? null,
      {},
    );
    this.usage = this.description = null;
    return true;
  }

  static dispatch(
    this: ThorClass,
    meth: unknown,
    givenArgs: string[],
    givenOpts: unknown,
    config: Record<string, unknown>,
  ): unknown {
    const command = this.allCommands()[givenArgs.shift()!];
    return command.run(new this([], {}, config) as never);
  }

  constructor(...args: unknown[]) {
    initializeIncludedModules(this, ...args);
  }
}
include(Thor, Base);
extend(Thor, ClassMethods);

describe("Exit conditions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 0, not bubble up EPIPE, if EPIPE is raised", async () => {
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
    let epiped = false;

    const command = class extends Thor {
      static {
        (this as unknown as ThorClass).desc("my_action", "testing EPIPE");
        (this as unknown as ThorClass).methodAdded("my_action");
      }
      my_action() {
        epiped = true;
        throw new Errno.EPIPE();
      }
    } as unknown as ThorClass;

    await expect(command.start(["my_action"])).rejects.toThrow(SystemExit);
    expect(epiped).toEqual(true);
  });
});
