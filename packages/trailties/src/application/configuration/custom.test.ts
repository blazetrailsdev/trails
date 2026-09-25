import { describe, expect, it } from "vitest";
import { assertRaises, assertRespondTo, OrderedOptions } from "@blazetrails/activesupport";
import { ArgumentError, Method, rbObjMethod } from "@blazetrails/ruby-compat";
import { Configuration } from "../configuration.js";

describe("CustomTest", () => {
  it("access custom configuration point", async () => {
    const config = new Configuration();
    config.x.paymentProcessing.schedule = ":daily";
    config.x.paymentProcessing.retries = 3;
    config.x.superDebugger = true;
    config.x.hyperDebugger = false;
    config.x.nilDebugger = null;
    const x = config.x;
    expect(x.paymentProcessing.schedule).toBe(":daily");
    expect(x.paymentProcessing.retries).toBe(3);
    expect(x.superDebugger).toBe(true);
    expect(x.hyperDebugger).toBe(false);
    expect(x.nilDebugger).toBeNull();
    expect(x.iDoNotExist.zomg).toBeUndefined();
    assertRespondTo(x, "iDoNotExist");
    expect(rbObjMethod(x, "iDoNotExist")).toBeInstanceOf(Method);
    expect(x.iDoNotExist).toBeInstanceOf(OrderedOptions);
    await assertRaises(
      [ArgumentError],
      {
        match:
          "wrong number of arguments (given 1, expected 0) when reading configuration `iDoNotExist`",
      },
      () => rbObjMethod(x, "iDoNotExist").call(false),
    );
  });
});
