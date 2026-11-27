import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { Account } from "../../../app/models/account.ts";
import type { User } from "../../../app/models/user.ts";

describe("Accounts::CustomStylesControllerTest", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
    await t.signIn("david");
  });

  it("edit", async () => {
    await t.get("/account/custom_styles/edit");
    t.assertResponse(":ok");
  });

  it("update", async () => {
    expect((await fixture<User>("users", "david")).isAdministrator()).toBe(true);

    await t.put("/account/custom_styles", {
      params: { account: { custom_styles: ":root { --color-text: red; }" } },
    });

    t.assertRedirectedTo("http://www.example.com/account/custom_styles/edit");
    expect((await fixture<Account>("accounts", "signal")).custom_styles).toBe(
      ":root { --color-text: red; }",
    );
  });

  it("non-admins cannot update", async () => {
    await t.signIn("kevin");
    expect((await fixture<User>("users", "kevin")).isMember()).toBe(true);

    await t.put("/account/custom_styles", {
      params: { account: { custom_styles: ":root { --color-text: red; }" } },
    });
    t.assertResponse(":forbidden");
  });
});
