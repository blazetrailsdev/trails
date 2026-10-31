import { beforeEach, describe, expect, it } from "vitest";
import type { Extended } from "@blazetrails/activesupport";
import { StrictLoadingViolationError } from "@blazetrails/activerecord";
import type { ClassMethods } from "./attached/model.js";
import "./test-helpers/database/setup.js";
import { User } from "./test-helpers/test-helper.js";

describe("ActiveStorage::StrictLoadingTest", () => {
  class Admin extends User {
    static {
      const attached = this as unknown as Extended<typeof ClassMethods>;
      attached.hasOneAttached("image", { strictLoading: true });
      attached.hasManyAttached("images", { strictLoading: true });
    }
  }

  beforeEach(async () => {
    await Admin.createBang({ name: "David" });
  });

  it("has_one_attached raises if strict loading and lazy loading", async () => {
    await expect(async () => {
      const admins = Admin.all();
      await admins.asJson({ include: "image" });
    }).rejects.toThrow(StrictLoadingViolationError);
  });

  it("has_many_attached raises if strict loading and lazy loading", async () => {
    await expect(async () => {
      const admins = Admin.all();
      await admins.asJson({ include: "images" });
    }).rejects.toThrow(StrictLoadingViolationError);
  });
});
