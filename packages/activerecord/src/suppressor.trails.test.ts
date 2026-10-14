import { describe, it, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import * as Suppressor from "./suppressor.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Notification } from "./test-helpers/models/notification.js";
import { User } from "./test-helpers/models/user.js";

fixtures([]);

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
