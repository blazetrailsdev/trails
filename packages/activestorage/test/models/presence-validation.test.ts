import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "../support/database/setup.js";
import { createBlob, User } from "../support/test-helper.js";

describe("ActiveStorage::PresenceValidationTest", () => {
  class Admin extends User {}

  beforeAll(async () => {
    await Admin.loadSchema();
  });

  afterEach(() => {
    (Admin as unknown as { clearValidatorsBang(): void }).clearValidatorsBang();
  });

  it("validates_presence_of has_one_attached", async () => {
    Admin.validatesPresenceOf("avatar");
    const a = new Admin({ name: "DHH" });
    expect(await a.isInvalid()).toBeTruthy();

    await a.avatar.attach(await createBlob({ filename: "funky.jpg" }));
    expect(await a.isValid()).toBeTruthy();
  });

  it("validates_presence_of has_many_attached", async () => {
    Admin.validatesPresenceOf("highlights");
    const a = new Admin({ name: "DHH" });
    expect(await a.isInvalid()).toBeTruthy();

    await a.highlights.attach(await createBlob({ filename: "funky.jpg" }));
    expect(await a.isValid()).toBeTruthy();
  });
});
