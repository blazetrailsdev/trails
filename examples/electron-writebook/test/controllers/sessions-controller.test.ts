import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import { isPresent } from "@blazetrails/activesupport";
import { Session } from "../../app/models/session.ts";
import { User } from "../../app/models/user.ts";

const ALLOWED_BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
const DISALLOWED_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0";

describe("SessionsControllerTest", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest("sessions");
  });

  it("new", async () => {
    await t.get("/session/new");
    t.assertResponse(":success");
  });

  it("new redirects to first run when no users exist", async () => {
    await User.destroyAll();

    await t.get("/session/new");

    t.assertRedirectedTo("http://www.example.com/first_run");
  });

  it("new denied with incompatible browser", async () => {
    await t.get("/session/new", { env: { HTTP_USER_AGENT: DISALLOWED_BROWSER } });
    expect(t.response.body).toMatch(/Your browser is not supported/);
  });

  it("new allowed with compatible browser", async () => {
    await t.get("/session/new", { env: { HTTP_USER_AGENT: ALLOWED_BROWSER } });
    expect(t.response.body).not.toMatch(/Your browser is not supported/);
  });

  it("create with valid credentials", async () => {
    const before = (await Session.count()) as number;
    await t.post("/session", {
      params: { email_address: "david@example.com", password: "secret123456" },
    });
    expect(await Session.count()).toBe(before + 1);

    t.assertRedirectedTo("http://www.example.com/");
    expect(t.parsedCookies().signed.get("session_token")).toBeTruthy();
  });

  it("create records the proxy's client IP over a client-sent Forwarded header", async () => {
    await t.post("/session", {
      params: { email_address: "david@example.com", password: "secret123456" },
      env: { HTTP_X_FORWARDED_FOR: "1.2.3.4", HTTP_FORWARDED: "for=9.9.9.9" },
    });

    t.assertRedirectedTo("/");
    expect(((await Session.last()) as Session).ip_address).toBe("1.2.3.4");
  });

  it("create with invalid credentials", async () => {
    await t.post("/session", { params: { email_address: "david@example.com", password: "wrong" } });

    t.assertResponse(":unauthorized");
    expect(t.parsedCookies().signed.get("session_token") == null).toBe(true);
  });

  it("destroy", async () => {
    await t.signIn("david");
    const session = (await (await fixture<User>("users", "david")).sessions.last()) as Session;

    const before = (await Session.count()) as number;
    await t.delete("/session");
    expect(await Session.count()).toBe(before - 1);

    t.assertRedirectedTo("http://www.example.com/");
    expect(isPresent(t.cookies.get("session_token"))).toBe(false);
    expect(await Session.findBy({ id: session.id })).toBeNull();
  });
});
