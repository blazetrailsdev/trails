/**
 * Port of vendor/rails/activerecord/test/cases/secure_password_test.rb
 * Test names match the Rails counterpart.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

describe("SecurePasswordTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ users: TEST_SCHEMA.users });
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
    // Warm-up (mostly to ensure the DB connection is established)
    await (User as any).authenticateBy({ token: user.token, password: PASSWORD });

    // Both the not-found path and the found-but-wrong-password path must run
    // the password hash so a timing attacker can't distinguish them: the
    // not-found run should not be substantially shorter than the
    // wrong-password run.
    const t0 = performance.now();
    expect(await (User as any).authenticateBy({ token: user.token, password: "wrong" })).toBeNull();
    const wrongPasswordMs = performance.now() - t0;

    const t1 = performance.now();
    expect(await (User as any).authenticateBy({ token: "wrong", password: PASSWORD })).toBeNull();
    const notFoundMs = performance.now() - t1;

    expect(notFoundMs).toBeGreaterThan(wrongPasswordMs * 0.3);
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
