import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { SecurePassword } from "@blazetrails/activemodel";
import { assertCalledWith, assertInDelta } from "@blazetrails/activesupport";
import { assertNoQueries } from "./testing/query-assertions.js";
import { fixtures } from "./test-fixtures.js";

async function retryFlakyTest(fn: () => Promise<void>, retryCount = 3): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      const isAssertion = error instanceof Error && error.name === "AssertionError";
      if (!isAssertion || attempt >= retryCount) throw error;
    }
  }
}

describe("SecurePasswordTest", () => {
  fixtures([]);
  beforeAll(async () => {
    await User.loadSchema();
  });

  let originalMinCost: boolean;
  let user: User;
  beforeEach(async () => {
    originalMinCost = SecurePassword.minCost;
    SecurePassword.minCost = true;

    user = await User.create({ password: "abc123", recovery_password: "123abc" });
  });

  afterEach(() => {
    SecurePassword.minCost = originalMinCost;
  });

  it("authenticate_by authenticates when password is correct", async () => {
    expect((await User.authenticateBy({ token: user.token, password: user.password }))?.id).toBe(
      user.id,
    );
  });

  it("authenticate_by does not authenticate when password is incorrect", async () => {
    expect(await User.authenticateBy({ token: user.token, password: "wrong" })).toBeNull();
  });

  it("authenticate_by takes the same amount of time regardless of whether record is found", async () => {
    await User.authenticateBy({ token: user.token, password: user.password });

    await retryFlakyTest(async () => {
      let foundAverageTimeInMs = 0;
      for (let i = 0; i < 1000; i++) {
        const t0 = performance.now();
        await User.authenticateBy({ token: user.token, password: user.password });
        foundAverageTimeInMs += (performance.now() - t0) / 1000;
      }

      let notFoundAverageTimeInMs = 0;
      for (let i = 0; i < 1000; i++) {
        const t0 = performance.now();
        await User.authenticateBy({ token: "wrong", password: user.password });
        notFoundAverageTimeInMs += (performance.now() - t0) / 1000;
      }

      assertInDelta(foundAverageTimeInMs, notFoundAverageTimeInMs, 0.5);
    });
  });

  it("authenticate_by short circuits when password is nil", async () => {
    await assertNoQueries(false, async () => {
      expect(await User.authenticateBy({ token: user.token, password: null })).toBeNull();
    });
  });

  it("authenticate_by short circuits when password is an empty string", async () => {
    await assertNoQueries(false, async () => {
      expect(await User.authenticateBy({ token: user.token, password: "" })).toBeNull();
    });
  });

  it("authenticate_by finds record using multiple attributes", async () => {
    expect(
      (
        await User.authenticateBy({
          token: user.token,
          auth_token: user.auth_token,
          password: user.password,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await User.authenticateBy({
        token: user.token,
        auth_token: "wrong",
        password: user.password,
      }),
    ).toBeNull();
  });

  it("authenticate_by authenticates using multiple passwords", async () => {
    expect(
      (
        await User.authenticateBy({
          token: user.token,
          password: user.password,
          recovery_password: user.recovery_password,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await User.authenticateBy({
        token: user.token,
        password: user.password,
        recovery_password: "wrong",
      }),
    ).toBeNull();
  });

  it("authenticate_by requires at least one password", async () => {
    await expect(User.authenticateBy({ token: user.token })).rejects.toThrow();
  });

  it("authenticate_by requires at least one attribute", async () => {
    await expect(User.authenticateBy({ password: user.password })).rejects.toThrow();
  });

  it("authenticate_by accepts any object that implements to_h", async () => {
    const params = {
      toH: (): Record<string, unknown> => {
        throw new Error("must access via to_h");
      },
    };

    let found: Promise<unknown> | undefined;
    assertCalledWith(
      params,
      "toH",
      [],
      { returns: { token: user.token, password: user.password } },
      () => {
        found = User.authenticateBy(params);
      },
    );
    expect(((await found) as User | null)?.id).toBe(user.id);

    let notFound: Promise<unknown> | undefined;
    assertCalledWith(
      params,
      "toH",
      [],
      { returns: { token: "wrong", password: user.password } },
      () => {
        notFound = User.authenticateBy(params);
      },
    );
    expect(await notFound).toBeNull();
  });
});
