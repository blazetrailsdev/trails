import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Thor } from "@blazetrails/thor";

interface Cli {
  desc(usage: string, description: string): void;
  methodAdded(name: string): void;
  start(args: string[]): Promise<unknown>;
}

class ArityCli extends Thor {
  static {
    (this as unknown as Cli).desc("top", "top");
    (this as unknown as Cli).methodAdded("top");
    (this as unknown as Cli).desc("deeper", "deeper");
    (this as unknown as Cli).methodAdded("deeper");
  }

  top(): void {
    throw new ArgumentError("wrong number of arguments (given 1, expected 2)");
  }

  deeper(): void {
    this.raises();
  }

  private raises(): void {
    throw new ArgumentError("wrong number of arguments (given 1, expected 2)");
  }

  static handleArgumentError(): never {
    throw new Error("handled");
  }
}

describe("Thor::Command#handle_argument_error?", () => {
  it("hands a body's own top-frame ArgumentError to handle_argument_error", async () => {
    await expect((ArityCli as unknown as Cli).start(["top"])).rejects.toThrow("handled");
  });

  it("re-raises one raised a frame deeper", async () => {
    await expect((ArityCli as unknown as Cli).start(["deeper"])).rejects.toBeInstanceOf(
      ArgumentError,
    );
  });
});
