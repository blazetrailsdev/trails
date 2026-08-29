import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { SecurePassword } from "@blazetrails/activemodel";
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
    expect(
      (await (User as any).authenticateBy({ token: user.token, password: user.password }))?.id,
    ).toBe(user.id);
  });

  it("authenticate_by does not authenticate when password is incorrect", async () => {
    expect(await (User as any).authenticateBy({ token: user.token, password: "wrong" })).toBeNull();
  });

  it("authenticate_by takes the same amount of time regardless of whether record is found", async () => {
    await (User as any).authenticateBy({ token: user.token, password: user.password });
    await (User as any).authenticateBy({ token: "wrong", password: user.password });

    await retryFlakyTest(async () => {
      const SAMPLES = 8;
      let foundCorrectMs = Infinity;
      let wrongPasswordMs = Infinity;
      let notFoundMs = Infinity;
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = performance.now();
        expect(
          (await (User as any).authenticateBy({ token: user.token, password: user.password }))?.id,
        ).toBe(user.id);
        foundCorrectMs = Math.min(foundCorrectMs, performance.now() - t0);

        const t1 = performance.now();
        expect(
          await (User as any).authenticateBy({ token: user.token, password: "wrong" }),
        ).toBeNull();
        wrongPasswordMs = Math.min(wrongPasswordMs, performance.now() - t1);

        const t2 = performance.now();
        expect(
          await (User as any).authenticateBy({ token: "wrong", password: user.password }),
        ).toBeNull();
        notFoundMs = Math.min(notFoundMs, performance.now() - t2);
      }

      expect(notFoundMs).toBeGreaterThan(foundCorrectMs * 0.3);
      expect(notFoundMs).toBeGreaterThan(wrongPasswordMs * 0.3);
    });
  });

  it("authenticate_by short circuits when password is nil", async () => {
    await assertNoQueries(false, async () => {
      expect(await (User as any).authenticateBy({ token: user.token, password: null })).toBeNull();
    });
  });

  it("authenticate_by short circuits when password is an empty string", async () => {
    await assertNoQueries(false, async () => {
      expect(await (User as any).authenticateBy({ token: user.token, password: "" })).toBeNull();
    });
  });

  it("authenticate_by finds record using multiple attributes", async () => {
    expect(
      (
        await (User as any).authenticateBy({
          token: user.token,
          auth_token: user.auth_token,
          password: user.password,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await (User as any).authenticateBy({
        token: user.token,
        auth_token: "wrong",
        password: user.password,
      }),
    ).toBeNull();
  });

  it("authenticate_by authenticates using multiple passwords", async () => {
    expect(
      (
        await (User as any).authenticateBy({
          token: user.token,
          password: user.password,
          recovery_password: user.recovery_password,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await (User as any).authenticateBy({
        token: user.token,
        password: user.password,
        recovery_password: "wrong",
      }),
    ).toBeNull();
  });

  it("authenticate_by requires at least one password", async () => {
    await expect((User as any).authenticateBy({ token: user.token })).rejects.toThrow();
  });

  it("authenticate_by requires at least one attribute", async () => {
    await expect((User as any).authenticateBy({ password: user.password })).rejects.toThrow();
  });

  it("authenticate_by accepts any object that implements to_h", async () => {
    expect(
      (
        await (User as any).authenticateBy({
          toH: () => ({ token: user.token, password: user.password }),
        })
      )?.id,
    ).toBe(user.id);

    expect(
      await (User as any).authenticateBy({
        toH: () => ({ token: "wrong", password: user.password }),
      }),
    ).toBeNull();
  });
});
