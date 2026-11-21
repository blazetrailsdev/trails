import { constDefined, constGet, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";
import * as exampleServiceProxy from "../examples/example-service-proxy.js";
import * as forwardHost from "../examples/forward-host.js";
import * as rackPhpProxy from "../examples/rack-php-proxy.js";
import * as trustingProxy from "../examples/trusting-proxy.js";

describe("ExamplesTest", () => {
  const EXAMPLES = {
    "forward-host": ["ForwardHost", forwardHost],
    "rack-php-proxy": ["RackPhpProxy", rackPhpProxy],
    "trusting-proxy": ["TrustingProxy", trustingProxy],
    "example-service-proxy": ["ExampleServiceProxy", exampleServiceProxy],
  } as const;

  it("examples are safe to load without rails", () => {
    expect(!("Trails" in TopLevel), "this test assumes Trails is not loaded").toBeTruthy();

    for (const [file, [className, mod]] of Object.entries(EXAMPLES)) {
      expect(
        () => constSet(TopLevel, className, (mod as Record<string, unknown>)[className]),
        `loading ${file} outside Trails must not raise`,
      ).not.toThrow();
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
