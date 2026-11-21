import { constDefined, constGet, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";

describe("ExamplesTest", () => {
  const EXAMPLES = {
    "forward-host": "ForwardHost",
    "rack-php-proxy": "RackPhpProxy",
    "trusting-proxy": "TrustingProxy",
    "example-service-proxy": "ExampleServiceProxy",
  } as const;

  it("examples are safe to load without rails", async () => {
    expect("Trails" in TopLevel, "this test assumes Trails is not loaded").toBe(false);

    for (const [file, className] of Object.entries(EXAMPLES)) {
      const mod = (await import(`../examples/${file}.ts`)) as Record<string, unknown>;
      constSet(TopLevel, className, mod[className]);
      expect(
        constDefined(TopLevel, className),
        `${className} should be defined after loading ${file}`,
      ).toBe(true);
      expect(
        (constGet(TopLevel, className) as { prototype: object }).prototype instanceof Proxy,
        `${className} should subclass Rack::Proxy`,
      ).toBe(true);
    }
  });
});
