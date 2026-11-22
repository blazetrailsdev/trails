import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  beforeEach(resetDatabase);

  it("normalizes the email address", async () => {
    const user = await User.createBang({ email_address: "  Ada@Example.COM " });
    expect(user.email_address).toBe("ada@example.com");
  });

  it("rejects a duplicate or malformed email address", async () => {
    await User.createBang({ email_address: "ada@example.com" });
    expect((await User.create({ email_address: "ADA@example.com" })).isPersisted()).toBe(false);
    expect((await User.create({ email_address: "not-an-email" })).isPersisted()).toBe(false);
  });

  it("finds a user by a magic link token", async () => {
    const user = await User.createBang({ email_address: "ada@example.com" });
    const token = user.generateTokenFor("magic_link");
    expect((await User.findByTokenFor("magic_link", token))?.id).toBe(user.id);
  });

  it("a magic link stops working once the user signs in", async () => {
    const user = await User.createBang({ email_address: "ada@example.com" });
    const token = user.generateTokenFor("magic_link");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await user.touch();
    expect(await User.findByTokenFor("magic_link", token)).toBeNull();
  });

  it("displays the name, falling back to the address's local part", async () => {
    const user = new User({ email_address: "ada@example.com" });
    expect(user.displayName()).toBe("ada");
    user.name = "Ada Lovelace";
    expect(user.displayName()).toBe("Ada Lovelace");
    expect(user.initials()).toBe("AD");
  });
});
