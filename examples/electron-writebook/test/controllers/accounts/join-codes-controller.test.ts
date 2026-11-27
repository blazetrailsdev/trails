import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Account } from "../../../app/models/account.ts";

describe("Accounts::JoinCodesControllerTest", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest("join-codes");
    await t.signIn("david");
  });

  it("create new join code", async () => {
    const joinCode = async () =>
      (await (await fixture<Account>("accounts", "signal")).reload()).join_code;
    const before = await joinCode();

    await t.post("/account/join_code");
    t.assertRedirectedTo("http://www.example.com/users");

    expect(await joinCode()).not.toBe(before);
  });

  it("only administrators can create new join codes", async () => {
    await t.signIn("jz");
    await t.post("/account/join_code");
    t.assertResponse(":forbidden");
  });
});
