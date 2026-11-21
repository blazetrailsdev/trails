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
    expect(!("Trails" in TopLevel), "this test assumes Trails is not loaded").toBeTruthy();

    for (const [file, className] of Object.entries(EXAMPLES)) {
      const load = import(`../examples/${file}.ts`) as Promise<Record<string, unknown>>;
      await expect(load, `loading ${file} outside Trails must not raise`).resolves.not.toThrow();
      constSet(TopLevel, className, (await load)[className]);
      expect(
        constDefined(TopLevel, className),
        `${className} should be defined after loading ${file}`,
      ).toBeTruthy();
      expect(
        (constGet(TopLevel, className) as { prototype: object }).prototype instanceof Proxy,
        `${className} should subclass Rack::Proxy`,
      ).toBeTruthy();
    }
  });
});
