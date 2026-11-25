import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../test-helper.ts";
import { User } from "../../../app/models/user.ts";

describe("User::RoleTest", () => {
  beforeEach(resetDatabase);

  it("creating users makes them members by default", async () => {
    const user = (await User.createBang({
      name: "User",
      email_address: "user@example.com",
      password: "secret123456",
    })) as User;
    expect(user.isMember()).toBe(true);
  });

  it("can_administer?", () => {
    expect(new User({ role: "administrator" }).isCanAdminister()).toBe(true);

    expect(new User({ role: "member" }).isCanAdminister()).toBe(false);
    expect(new User().isCanAdminister()).toBe(false);
  });
});
