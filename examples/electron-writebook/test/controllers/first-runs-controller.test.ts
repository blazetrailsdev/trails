import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, loadFixtures } from "../test-helper.ts";
import { Account } from "../../app/models/account.ts";
import { Book } from "../../app/models/book.ts";
import { User } from "../../app/models/user.ts";

const HOST = "http://www.example.com";
const PARAMS = {
  user: { name: "New Person", email_address: "new@example.com", password: "secret123456" },
};

describe("FirstRunsControllerTest", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    await Book.destroyAll();
    await User.destroyAll();
    await Account.destroyAll();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  const createUser = () =>
    User.createBang({
      name: "Existing Person",
      email_address: "user@example.com",
      password: "secret123456",
    });

  it("new", async () => {
    await t.get("/first_run");
    t.assertResponse(":success");
  });

  it("new is not permitted when users exist", async () => {
    await createUser();

    await t.get("/first_run");
    t.assertRedirectedTo(`${HOST}/`);
  });

  it("create", async () => {
    const before = (await User.count()) as number;
    await t.post("/first_run", { params: PARAMS });
    expect(await User.count()).toBe(before + 1);

    t.assertRedirectedTo(`${HOST}/`);

    expect(t.parsedCookies().signed.get("session_token")).toBeTruthy();
  });

  it("create is not permitted when users exist", async () => {
    await createUser();

    const before = (await User.count()) as number;
    await t.post("/first_run", { params: PARAMS });
    expect(await User.count()).toBe(before);

    t.assertRedirectedTo(`${HOST}/`);
  });

  it("create redirects without a new administrator when another first run has already created the account", async () => {
    await Account.createBang({ name: "Writebook" });

    const before = (await User.count()) as number;
    await t.post("/first_run", { params: PARAMS });
    expect(await User.count()).toBe(before);

    t.assertRedirectedTo("/");
    expect(t.parsedCookies().signed.get("session_token") == null).toBe(true);
  });
});
