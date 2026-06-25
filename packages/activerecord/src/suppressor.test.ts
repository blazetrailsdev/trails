/**
 * Ported from vendor/rails/activerecord/test/cases/suppressor_test.rb.
 * Test names match the Ruby `test_*` methods.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { Notification } from "./test-helpers/models/notification.js";
import { User, UserWithNotification } from "./test-helpers/models/user.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

describe("SuppressorTest", () => {
  it("suppresses create", async () => {
    const before = await Notification.count();
    await Notification.suppress(async () => {
      await Notification.create();
      await Notification.createBang();
      await new Notification().save();
      await new Notification().saveBang();
    });
    expect(await Notification.count()).toBe(before);
  });

  it("suppresses update", async () => {
    const user = await User.createBang({ token: "asdf" });

    await User.suppress(async () => {
      await user.update({ token: "ghjkl" });
      expect((await user.reload()).token).toBe("asdf");

      await user.updateBang({ token: "zxcvbnm" });
      expect((await user.reload()).token).toBe("asdf");

      user.token = "qwerty";
      await user.save();
      expect((await user.reload()).token).toBe("asdf");

      user.token = "uiop";
      await user.saveBang();
      expect((await user.reload()).token).toBe("asdf");
    });
  });

  it("suppresses create in callback", async () => {
    const usersBefore = (await User.count()) as number;
    const notificationsBefore = await Notification.count();
    await Notification.suppress(async () => {
      await UserWithNotification.createBang();
    });
    expect(await User.count()).toBe(usersBefore + 1);
    expect(await Notification.count()).toBe(notificationsBefore);
  });

  it("resumes saving after suppression complete", async () => {
    await Notification.suppress(async () => {
      await UserWithNotification.createBang();
    });

    const before = (await Notification.count()) as number;
    await Notification.createBang({ message: "New Comment" });
    expect(await Notification.count()).toBe(before + 1);
  });

  it("suppresses validations on create", async () => {
    const before = await Notification.count();
    await Notification.suppress(async () => {
      await User.create();
      await User.createBang();
      await new User().save();
      await new User().saveBang();
    });
    expect(await Notification.count()).toBe(before);
  });

  it("suppresses when nested multiple times", async () => {
    const before = await Notification.count();
    await Notification.suppress(async () => {
      await Notification.suppress(async () => {});
      await Notification.create();
      await Notification.createBang();
      await new Notification().save();
      await new Notification().saveBang();
    });
    expect(await Notification.count()).toBe(before);
  });
});

// TS-only coverage of the `Suppressor.registry` plumbing (no Rails counterpart).
// These exercise async-scope isolation of `IsolatedExecutionState` and never
// touch the database, so they need no fixtures or schema.
describe("Suppressor.registry", () => {
  it("returns the suppression registry", () => {
    const registry = Base.registry;
    expect(registry).toBeDefined();
    expect(typeof registry).toBe("object");
  });

  it("registry reflects active suppression by class name", async () => {
    expect(Base.registry.Notification).toBeFalsy();

    await Notification.suppress(async () => {
      expect(Base.registry.Notification).toBeTruthy();
    });

    expect(Base.registry.Notification).toBeFalsy();
  });

  it("returns the same object on consecutive calls in the same scope", () => {
    expect(Base.registry).toBe(Base.registry);
  });

  it("a held reference inside the scope observes the active suppression", async () => {
    await User.suppress(async () => {
      const reg = Base.registry;
      expect(reg.User).toBe(true);
    });
    expect(Base.registry.User).toBeFalsy();
  });

  it("isolates registry state across concurrent suppress blocks", async () => {
    expect(Base.registry.Notification).toBeFalsy();
    expect(Base.registry.User).toBeFalsy();

    await Promise.all([
      Notification.suppress(async () => {
        await Promise.resolve();
        expect(Base.registry.Notification).toBe(true);
        expect(Base.registry.User).toBeFalsy();
      }),
      User.suppress(async () => {
        await Promise.resolve();
        expect(Base.registry.User).toBe(true);
        expect(Base.registry.Notification).toBeFalsy();
      }),
    ]);

    expect(Base.registry.Notification).toBeFalsy();
    expect(Base.registry.User).toBeFalsy();
  });

  it("registry stays truthy across nested suppress blocks", async () => {
    await Notification.suppress(async () => {
      expect(Base.registry.Notification).toBeTruthy();
      await Notification.suppress(async () => {
        expect(Base.registry.Notification).toBeTruthy();
      });
      expect(Base.registry.Notification).toBeTruthy();
    });
    expect(Base.registry.Notification).toBeFalsy();
  });
});
