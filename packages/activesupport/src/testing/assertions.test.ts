import { describe, expect, it } from "vitest";

import { _setTrailsLogger } from "../trails-logger-slot.js";
import {
  assertChanges,
  assertDifference,
  assertNoChanges,
  assertNoDifference,
  assertNot,
  assertNothingRaised,
  assertRaises,
  UnexpectedError,
} from "./assertions.js";

describe("AssertionsTest", () => {
  it("assert not", () => {
    assertNot(null);
    assertNot(false);
    expect(() => assertNot("foo")).toThrow(/Expected "foo" to be nil or false/);
  });

  it("assert raises with match", async () => {
    const error = await assertRaises([TypeError], { match: /incorrect param/i }, () => {
      throw new TypeError("incorrect param given");
    });
    expect(error).toBeInstanceOf(TypeError);
  });

  it("assert nothing raised", async () => {
    expect(await assertNothingRaised(() => 42)).toBe(42);
  });

  it("assert nothing raised wraps the raised error", async () => {
    const raised = new TypeError("boom");
    const error = await assertNothingRaised(() => {
      throw raised;
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnexpectedError);
    expect((error as UnexpectedError).error).toBe(raised);
    expect((error as UnexpectedError).message).toMatch(/TypeError: boom/);
  });

  it("assert difference warns through the tagged logger and re-raises", async () => {
    const warnings: unknown[] = [];
    _setTrailsLogger({
      warn: (msg: unknown) => warnings.push(msg),
      debug: () => {},
      "warn?": true,
    } as never);
    try {
      let counter = 0;
      const error = await assertDifference(
        () => counter,
        1,
        null,
        () => {
          counter += 1;
          throw new RangeError("nope");
        },
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnexpectedError);
      expect(String(warnings[0])).toBe(
        "AssertionsTest - assert difference warns through the tagged logger and re-raises: " +
          "RangeError raised.\n" +
          "If you expected this exception, use `assert_raises` as near to the code that raises as possible.\n" +
          "Other block based assertions (e.g. `assert_difference`) can be used, as long as `assert_raises` is inside their block.\n",
      );
    } finally {
      _setTrailsLogger(null);
    }
  });

  it("assert difference quotes the expression, not the whole closure", async () => {
    const counter = 0;
    await expect(
      assertDifference(
        () => counter,
        1,
        null,
        () => {},
      ),
    ).rejects.toThrow("`counter` didn't change by 1, but by 0");
  });

  it("assert difference", async () => {
    let counter = 0;
    await assertDifference(
      () => counter,
      1,
      null,
      () => {
        counter += 1;
      },
    );

    await expect(
      assertDifference(
        () => counter,
        1,
        null,
        () => {},
      ),
    ).rejects.toThrow(/didn't change by 1, but by 0/);
  });

  it("assert difference with an async expression", async () => {
    let counter = 0;
    await assertDifference(
      async () => counter,
      2,
      null,
      async () => {
        counter += 2;
      },
    );
  });

  it("assert difference with a list of expressions", async () => {
    let a = 0;
    let b = 0;
    await assertDifference([() => a, () => b], 1, null, () => {
      a += 1;
      b += 1;
    });
  });

  it("assert difference with a hash of expressions", async () => {
    let a = 0;
    let b = 0;
    await assertDifference(
      new Map([
        [() => a, 1],
        [() => b, 2],
      ]),
      "counts should move together",
      () => {
        a += 1;
        b += 2;
      },
    );

    await expect(
      assertDifference(new Map([[() => a, 1]]), "counts should move together", () => {}),
    ).rejects.toThrow(/counts should move together/);
  });

  it("assert no difference", async () => {
    let counter = 0;
    await assertNoDifference(
      () => counter,
      null,
      () => {},
    );
    await expect(
      assertNoDifference(
        () => counter,
        "counter should hold",
        () => {
          counter += 1;
        },
      ),
    ).rejects.toThrow(/counter should hold/);
  });

  it("assert changes", async () => {
    let status = "good";
    await assertChanges(
      () => status,
      null,
      { from: "good", to: "bad" },
      () => {
        status = "bad";
      },
    );

    await expect(
      assertChanges(
        () => status,
        null,
        {},
        () => {},
      ),
    ).rejects.toThrow(/didn't change/);
  });

  it("assert no changes", async () => {
    let status = "good";
    await assertNoChanges(
      () => status,
      null,
      { from: "good" },
      () => {},
    );
    await expect(
      assertNoChanges(
        () => status,
        null,
        {},
        () => {
          status = "bad";
        },
      ),
    ).rejects.toThrow(/changed/);
  });
});
