import { describe, it, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import * as Suppressor from "./suppressor.js";
import { fixtures } from "./test-fixtures.js";
import { Notification } from "./test-helpers/models/notification.js";
import { User, UserWithNotification } from "./test-helpers/models/user.js";

fixtures([]);

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

describe("Suppressor.registry", () => {
  it("returns the suppression registry", () => {
    const registry = Suppressor.registry();
    expect(registry).toBeDefined();
    expect(typeof registry).toBe("object");
  });

  it("registry reflects active suppression by class name", async () => {
    expect(Suppressor.registry().Notification).toBeFalsy();

    await Notification.suppress(async () => {
      expect(Suppressor.registry().Notification).toBeTruthy();
    });

    expect(Suppressor.registry().Notification).toBeFalsy();
  });

  it("returns the same object on consecutive calls in the same scope", () => {
    expect(Suppressor.registry()).toBe(Suppressor.registry());
  });

  it("a held reference inside the scope observes the active suppression", async () => {
    await User.suppress(async () => {
      const reg = Suppressor.registry();
      expect(reg.User).toBe(true);
    });
    expect(Suppressor.registry().User).toBeFalsy();
  });

  it("isolates registry state across concurrent suppress blocks", async () => {
    expect(Suppressor.registry().Notification).toBeFalsy();
    expect(Suppressor.registry().User).toBeFalsy();

    await Promise.all([
      new Thread(async () =>
        Notification.suppress(async () => {
          await Promise.resolve();
          expect(Suppressor.registry().Notification).toBe(true);
          expect(Suppressor.registry().User).toBeFalsy();
        }),
      ).value(),
      new Thread(async () =>
        User.suppress(async () => {
          await Promise.resolve();
          expect(Suppressor.registry().User).toBe(true);
          expect(Suppressor.registry().Notification).toBeFalsy();
        }),
      ).value(),
    ]);

    expect(Suppressor.registry().Notification).toBeFalsy();
    expect(Suppressor.registry().User).toBeFalsy();
  });

  it("registry stays truthy across nested suppress blocks", async () => {
    await Notification.suppress(async () => {
      expect(Suppressor.registry().Notification).toBeTruthy();
      await Notification.suppress(async () => {
        expect(Suppressor.registry().Notification).toBeTruthy();
      });
      expect(Suppressor.registry().Notification).toBeTruthy();
    });
    expect(Suppressor.registry().Notification).toBeFalsy();
  });
});
