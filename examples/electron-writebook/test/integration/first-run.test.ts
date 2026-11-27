import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";
import { Account } from "../../app/models/account.ts";
import { User } from "../../app/models/user.ts";

describe("FirstRunsControllerTest", () => {
  beforeEach(resetDatabase);

  it("redirects to the first run when no one has signed up", async () => {
    const t = new ApplicationIntegrationTest("redirect");
    await t.get("/session/new");
    expect(t.response.location).toMatch(/\/first_run$/);
  });

  it("creates the administrator and the account, then signs in", async () => {
    const t = new ApplicationIntegrationTest("create");
    await t.get("/first_run");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("Create your account");

    await t.firstRun();
    expect(t.response.location).toMatch(/\/$/);

    const user = (await User.first()) as User;
    expect(user.role).toBe("administrator");
    expect((await Account.first())!.join_code).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    await t.get("/");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("Create a new book");
  });
});
