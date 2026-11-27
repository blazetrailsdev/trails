import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import type { Account } from "../../app/models/account.ts";
import { Session } from "../../app/models/session.ts";
import { User } from "../../app/models/user.ts";

const HOST = "http://www.example.com";

describe("UsersControllerTest", () => {
  let t: ApplicationIntegrationTest;
  let joinCode: string;
  const users = (label: string) => fixture<User>("users", label);

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    joinCode = (await fixture<Account>("accounts", "signal")).join_code;
  });

  it("new", async () => {
    await t.get(`/join/${joinCode}`);
    t.assertResponse(":success");
  });

  it("new does not allow a signed in user", async () => {
    await t.signIn("david");

    await t.get(`/join/${joinCode}`);
    t.assertRedirectedTo(`${HOST}/`);
  });

  it("new requires a join code", async () => {
    await t.get("/join/not");
    t.assertResponse(":not_found");
  });

  it("create", async () => {
    const before = (await User.count()) as number;
    await t.post(`/join/${joinCode}`, {
      params: {
        user: { name: "New Person", email_address: "new@example.com", password: "secret123456" },
      },
    });
    expect(await User.count()).toBe(before + 1);

    t.assertRedirectedTo(`${HOST}/`);

    const user = (await User.last()) as User;
    const session = (await Session.findBy({
      token: t.parsedCookies().signed.get("session_token"),
    })) as Session;
    expect((await session.user).id).toBe(user.id);
  });

  it("creating a new user with an existing email address redirects to login screen", async () => {
    const david = await users("david");
    const before = (await User.count()) as number;
    await t.post(`/join/${joinCode}`, {
      params: {
        user: {
          name: "Another David",
          email_address: david.email_address,
          password: "secret123456",
        },
      },
    });
    expect(await User.count()).toBe(before);

    t.assertRedirectedTo(
      `${HOST}/session/new?email_address=${encodeURIComponent(david.email_address!)}`,
    );
  });

  it("update", async () => {
    await t.signIn("david");
    expect((await users("david")).isAdministrator()).toBe(true);

    await t.put(`/users/${(await users("kevin")).id}`, {
      params: { user: { role: "administrator" } },
    });

    t.assertRedirectedTo(`${HOST}/users`);
    expect((await (await users("kevin")).reload()).isAdministrator()).toBe(true);
  });

  it("update does not allow non-admins to change roles", async () => {
    await t.signIn("kevin");
    expect((await users("kevin")).isAdministrator()).toBe(false);

    await t.put(`/users/${(await users("kevin")).id}`, {
      params: { user: { role: "administrator" } },
    });

    t.assertResponse(":forbidden");
    expect((await (await users("kevin")).reload()).isAdministrator()).toBe(false);
  });

  it("destroy", async () => {
    await t.signIn("david");

    const before = await User.active().count();
    await t.delete(`/users/${(await users("kevin")).id}`);
    expect(await User.active().count()).toBe(before - 1);

    t.assertRedirectedTo(`${HOST}/users`);
    expect(await User.active().findBy({ id: (await users("kevin")).id })).toBeNull();
  });

  it("destroy is not allowed to non-admins", async () => {
    await t.signIn("kevin");

    await t.delete(`/users/${(await users("david")).id}`);
    t.assertResponse(":forbidden");
  });
});
