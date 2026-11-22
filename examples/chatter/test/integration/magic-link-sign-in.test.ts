import { beforeEach, describe, expect, it } from "vitest";
import { ActionMailer } from "@blazetrails/actionmailer";
import { ApplicationIntegrationTest, resetDatabase } from "../test-helper.ts";
import { User } from "../../app/models/user.ts";

function magicLinkPath(): string {
  const mail = ActionMailer.Base.deliveries.at(-1)!;
  const match = String(mail.body().encoded()).match(/https?:\/\/[^/\s]+(\/magic\/[^\s"<]+)/);
  return match![1];
}

describe("MagicLinkSignInTest", () => {
  beforeEach(async () => {
    await resetDatabase();
    ActionMailer.Base.deliveries.length = 0;
  });

  it("redirects a signed-out visitor to sign in", async () => {
    const t = new ApplicationIntegrationTest("signed out");
    await t.get("/");
    expect(t.response.status).toBe(302);
    expect(t.response.location).toMatch(/\/session\/new$/);
  });

  it("emails a link that signs in, creating the account, and works only once", async () => {
    const t = new ApplicationIntegrationTest("sign in");
    await t.post("/session", { params: { email_address: "Ada@Example.com" } });
    expect(t.response.location).toMatch(/\/session\/sent\?email_address=ada%40example\.com$/);
    expect(await User.findBy({ email_address: "ada@example.com" })).not.toBeNull();

    const mail = ActionMailer.Base.deliveries.at(-1)!;
    expect([...mail.to()]).toEqual(["ada@example.com"]);
    expect(mail.subject()).toBe("Your Chatter sign-in link");

    const path = magicLinkPath();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await t.get(path);
    expect(t.response.location).toMatch(/example\.com\/$/);
    await t.get("/");
    expect(t.response.location).toMatch(/\/rooms\/\d+$/);
    await t.get(t.response.location!);
    expect(t.response.status).toBe(200);
    expect(t.response.body).toContain("#general");

    const again = new ApplicationIntegrationTest("reuse");
    await again.get(path);
    expect(again.response.location).toMatch(/\/session\/new$/);
  });

  it("rejects a tampered link", async () => {
    const t = new ApplicationIntegrationTest("tampered");
    await t.get("/magic/not-a-token");
    expect(t.response.location).toMatch(/\/session\/new$/);
  });
});
