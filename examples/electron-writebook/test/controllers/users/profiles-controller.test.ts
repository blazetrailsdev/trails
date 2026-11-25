import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { User } from "../../../app/models/user.ts";

describe("Users::ProfilesControllerTest", () => {
  let t: ApplicationIntegrationTest;
  const users = (label: string) => fixture<User>("users", label);

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  it("show", async () => {
    await t.signIn("david");

    await t.get(`/users/${(await users("david")).id}/profile`);
    t.assertResponse(":success");

    await t.get(`/users/${(await users("kevin")).id}/profile`);
    t.assertResponse(":success");
  });

  it("edit is accessable to the current user", async () => {
    await t.signIn("david");

    await t.get(`/users/${(await users("david")).id}/profile/edit`);
    t.assertResponse(":success");

    await t.get(`/users/${(await users("kevin")).id}/profile/edit`);
    t.assertResponse(":forbidden");
  });

  it("update modifies profile for current user", async () => {
    await t.signIn("kevin");

    await t.put(`/users/${(await users("kevin")).id}/profile`, {
      params: { user: { name: "Bob" } },
    });

    t.assertRedirectedTo("http://www.example.com/users");
    expect((await (await users("kevin")).reload()).name).toBe("Bob");
  });

  it("update prohibits modifying profile of other users", async () => {
    await t.signIn("david");

    await t.put(`/users/${(await users("kevin")).id}/profile`, {
      params: { user: { name: "Bob" } },
    });

    t.assertResponse(":forbidden");
    expect((await (await users("kevin")).reload()).name).toBe("Kevin");
  });
});
