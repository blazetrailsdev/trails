import { beforeEach, describe, expect, it } from "vitest";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { Configuration } from "../trailtie/configuration.js";

describe("DynamicOptionsTest", () => {
  let config: Configuration & { foo: number };

  beforeEach(() => {
    config = new Configuration() as typeof config;
    for (const key of Object.keys(Configuration._options)) {
      delete Configuration._options[key];
    }
  });

  it("arbitrary keys can be set, reset, and read", () => {
    config.foo = 1;
    expect(config.foo).toBe(1);

    config.foo = 2;
    expect(config.foo).toBe(2);
  });

  it("raises NoMethodError if the key is unset and the method does not exist", () => {
    expect(() => config.get("unsetKey")).toThrow(NoMethodError);
  });

  it("raises NoMethodError with an informative message if assigning to an existing method", () => {
    let error: Error | undefined;
    expect(() => {
      try {
        (config as { eagerLoadNamespaces: unknown }).eagerLoadNamespaces = 1;
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(NoMethodError);

    expect(error!.message).toMatch(
      /Cannot assign to `eagerLoadNamespaces`, it is a configuration method/,
    );
  });
});
