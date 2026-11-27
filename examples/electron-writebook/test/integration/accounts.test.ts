import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";
import { Account } from "../../app/models/account.ts";
import { User } from "../../app/models/user.ts";

describe("SessionsFlowTest", () => {
  beforeEach(resetDatabase);

  it("signs out and back in with email and password", async () => {
    const t = new ApplicationIntegrationTest("signin");
    await t.firstRun();
    await t.delete("/session");
    expect(t.response.status).toBe(302);

    await t.get("/users");
    expect(t.response.location).toMatch(/\/session\/new$/);

    await t.post("/session", { params: { email_address: "ada@example.com", password: "wrong" } });
    expect(t.response.status).toBe(401);
    expect(t.response.body).toContain("panel shadow center margin-block-double shake");

    await t.post("/session", {
      params: { email_address: "ada@example.com", password: "secret123456" },
    });
    expect(t.response.status).toBe(302);
    await t.get("/users");
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("Share to invite more people");
  });
});

describe("UsersFlowTest", () => {
  beforeEach(resetDatabase);

  it("joins with the account's join code", async () => {
    const admin = new ApplicationIntegrationTest("admin");
    await admin.firstRun();
    const joinCode = (await Account.first())!.join_code;

    const t = new ApplicationIntegrationTest("join");
    await t.get("/join/nope");
    expect(t.response.status).toBe(404);

    await t.get(`/join/${joinCode}`);
    expect(t.response.status).toBe(200);
    await t.post(`/join/${joinCode}`, {
      params: {
        user: { name: "Grace", email_address: "grace@example.com", password: "secret123456" },
      },
    });
    expect(t.response.status).toBe(302);
    const grace = (await User.findBy({ name: "Grace" }))!;
    expect(grace.role).toBe("member");

    await t.get(`/users/${grace.id}/profile/edit`);
    expect(t.response.status).toBe(200);
    await t.patch(`/users/${grace.id}/profile`, { params: { user: { name: "Grace H" } } });
    expect((await User.find(grace.id)).name).toBe("Grace H");

    await admin.delete(`/users/${grace.id}`);
    await grace.reload();
    expect(grace.active).toBe(false);
  });

  it("lets an administrator set custom styles", async () => {
    const t = new ApplicationIntegrationTest("styles");
    await t.firstRun();
    await t.get("/account/custom_styles/edit");
    expect(t.response.status).toBe(200);
    await t.patch("/account/custom_styles", {
      params: { account: { custom_styles: "body { color: red; }" } },
    });
    await t.get("/");
    expect(t.response.body).toContain("body { color: red; }");
  });

  it("signs in through a transfer link", async () => {
    const admin = new ApplicationIntegrationTest("admin");
    await admin.firstRun();
    const user = (await User.first())!;

    const t = new ApplicationIntegrationTest("transfer");
    await t.get(`/session/transfers/${user.transferId()}`);
    expect(t.response.status).toBe(200);
    await t.put(`/session/transfers/${user.transferId()}`);
    expect(t.response.status).toBe(302);
    await t.get("/users");
    expect(t.response.status).toBe(200);
  });
});
