/**
 * Port of vendor/rails/activerecord/test/cases/secure_password_test.rb
 * Test names match the Rails counterpart.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

// Mirrors Rails' `retry_flaky_test` (secure_password_test.rb): retry the timing
// assertion a few times before failing, so a single unlucky preemption spike
// doesn't fail CI. Re-throws the last assertion error once retries are spent.
async function retryFlakyTest(fn: () => Promise<void>, retryCount = 3): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt >= retryCount) throw error;
    }
  }
}

describe("SecurePasswordTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await User.loadSchema();
  });

  // Our hasSecurePassword does not retain the plaintext on the instance after
  // save (Rails keeps `@password`), so the cleartext is held in a local to feed
  // authenticate_by — the assertions compare records by id, matching Rails' `==`.
  const PASSWORD = "abc123";
  const RECOVERY = "123abc";

  let user: User;
  beforeEach(async () => {
    // Rails: User.create(password:, recovery_password:). Our mass-assignment
    // does not route the virtual `password` / `recovery_password` writers, so
    // assign them explicitly before save.
    user = new User();
    (user as any).password = PASSWORD;
    (user as any).recovery_password = RECOVERY;
    await user.save();
  });

  it("authenticate_by authenticates when password is correct", async () => {
    expect(
      (await (User as any).authenticateBy({ token: user.token, password: PASSWORD }))?.id,
    ).toBe(user.id);
  });

  it("authenticate_by does not authenticate when password is incorrect", async () => {
    expect(await (User as any).authenticateBy({ token: user.token, password: "wrong" })).toBeNull();
  });

  it("authenticate_by takes the same amount of time regardless of whether record is found", async () => {
    // Warm-up both the found (verify) and not-found (decoy hash) paths so the
    // first timed sample doesn't eat crypto/JIT init cost and the DB connection
    // is established.
    await (User as any).authenticateBy({ token: user.token, password: PASSWORD });
    await (User as any).authenticateBy({ token: "wrong", password: PASSWORD });

    // Port of Rails' averaged + retried timing check
    // (activerecord/test/cases/secure_password_test.rb): Rails sums 1000
    // iterations to average out jitter and wraps the whole thing in
    // retry_flaky_test. We can't afford 1000 DB round-trips per path, so we
    // take the MINIMUM elapsed time over a handful of samples instead — the
    // min reflects the true CPU cost of the hash and is immune to the
    // GC/preemption spikes that make a single sample flaky (a preempted
    // wrong-password run measuring ~30ms was the original flake). Both the
    // not-found path and the found-but-wrong-password path must run the
    // password hash so a timing attacker can't distinguish them: the not-found
    // run must not be substantially shorter than the wrong-password run.
    await retryFlakyTest(async () => {
      const SAMPLES = 8;
      let wrongPasswordMs = Infinity;
      let notFoundMs = Infinity;
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = performance.now();
        expect(
          await (User as any).authenticateBy({ token: user.token, password: "wrong" }),
        ).toBeNull();
        wrongPasswordMs = Math.min(wrongPasswordMs, performance.now() - t0);

        const t1 = performance.now();
        expect(
          await (User as any).authenticateBy({ token: "wrong", password: PASSWORD }),
        ).toBeNull();
        notFoundMs = Math.min(notFoundMs, performance.now() - t1);
      }

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
          password: PASSWORD,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await (User as any).authenticateBy({
        token: user.token,
        auth_token: "wrong",
        password: PASSWORD,
      }),
    ).toBeNull();
  });

  it("authenticate_by authenticates using multiple passwords", async () => {
    expect(
      (
        await (User as any).authenticateBy({
          token: user.token,
          password: PASSWORD,
          recovery_password: RECOVERY,
        })
      )?.id,
    ).toBe(user.id);
    expect(
      await (User as any).authenticateBy({
        token: user.token,
        password: PASSWORD,
        recovery_password: "wrong",
      }),
    ).toBeNull();
  });

  it("authenticate_by requires at least one password", async () => {
    await expect((User as any).authenticateBy({ token: user.token })).rejects.toThrow();
  });

  it("authenticate_by requires at least one attribute", async () => {
    await expect((User as any).authenticateBy({ password: PASSWORD })).rejects.toThrow();
  });

  it("authenticate_by accepts any object that implements to_h", async () => {
    expect(
      (
        await (User as any).authenticateBy({
          toH: () => ({ token: user.token, password: PASSWORD }),
        })
      )?.id,
    ).toBe(user.id);

    expect(
      await (User as any).authenticateBy({
        toH: () => ({ token: "wrong", password: PASSWORD }),
      }),
    ).toBeNull();
  });
});
