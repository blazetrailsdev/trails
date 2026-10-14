import { describe, it, expect } from "vitest";
import { assertDifference, assertNoDifference } from "@blazetrails/activesupport";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Notification } from "./test-helpers/models/notification.js";
import { User, UserWithNotification } from "./test-helpers/models/user.js";

fixtures([]);

describe("SuppressorTest", () => {
  const notificationCount = () => Notification.count();
  const userCount = () => User.count();

  it("suppresses create", async () => {
    await assertNoDifference(notificationCount, null, async () => {
      await Notification.suppress(async () => {
        await Notification.create();
        await Notification.createBang();
        await new Notification().save();
        await new Notification().saveBang();
      });
    });
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
    await assertDifference(userCount, 1, null, async () => {
      await assertNoDifference(notificationCount, null, async () => {
        await Notification.suppress(async () => {
          await UserWithNotification.createBang();
        });
      });
    });
  });

  it("resumes saving after suppression complete", async () => {
    await Notification.suppress(async () => {
      await UserWithNotification.createBang();
    });

    await assertDifference(notificationCount, 1, null, async () => {
      await Notification.createBang({ message: "New Comment" });
    });
  });

  it("suppresses validations on create", async () => {
    await assertNoDifference(notificationCount, null, async () => {
      await Notification.suppress(async () => {
        await User.create();
        await User.createBang();
        await new User().save();
        await new User().saveBang();
      });
    });
  });

  it("suppresses when nested multiple times", async () => {
    await assertNoDifference(notificationCount, null, async () => {
      await Notification.suppress(async () => {
        await Notification.suppress(async () => {});
        await Notification.create();
        await Notification.createBang();
        await new Notification().save();
        await new Notification().saveBang();
      });
    });
  });
});
