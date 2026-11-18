import { block } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Cors } from "../../lib/index.js";

describe("Cors", () => {
  it("takes a block() passed in the opts slot as its block", () => {
    let ran = false;
    const cors = new Cors(
      async () => [200, {}, []] as [number, Record<string, string>, string[]],
      block(function (this: Cors) {
        ran = this instanceof Cors;
      }) as unknown as ConstructorParameters<typeof Cors>[1],
    );
    expect(ran).toBe(true);
    expect(cors.isDebug()).toBe(false);
  });
});
