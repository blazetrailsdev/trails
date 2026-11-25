import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../../test-helper.ts";
import type { User } from "../../../app/models/user.ts";

describe("Sessions::TransfersControllerTest", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  it("show renders when not signed in", async () => {
    await t.get("/session/transfers/some-token");

    t.assertResponse(":success");
  });

  it("update establishes a session when the code is valid", async () => {
    const user = await fixture<User>("users", "david");

    await t.put(`/session/transfers/${user.transferId()}`);

    t.assertRedirectedTo("http://www.example.com/");
    expect(t.parsedCookies().signed.get("session_token")).toBeTruthy();
  });
});
