import { beforeEach, describe, it, expect } from "vitest";
import { Base64, rbInspect } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { HttpAuthentication } from "../metal/http-authentication.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class DummyController extends Base {
  declare loggedIn: boolean;

  static {
    this.beforeAction("authenticate", { only: "index" });
    this.beforeAction("authenticateWithRequest", { only: "display" });
    this.beforeAction("authenticateLongCredentials", { only: "show" });
    this.beforeAction("authWithSpecialChars", { only: "special_creds" });

    this.httpBasicAuthenticateWith({ name: "David", password: "Goliath", only: "search" });
  }

  async index(): Promise<void> {
    await this.render({ plain: "Hello Secret" });
  }

  async display(): Promise<void> {
    if (this.loggedIn) await this.render({ plain: "Definitely Maybe" });
  }

  async show(): Promise<void> {
    await this.render({ plain: "Only for loooooong credentials" });
  }

  async specialCreds(): Promise<void> {
    await this.render({ plain: "Only for special credentials" });
  }

  async search(): Promise<void> {
    await this.render({ plain: "All inline" });
  }

  async noPassword(): Promise<void> {
    const [username, password] = this.authenticateWithHttpBasic((username, password) => {
      return [username, password];
    }) as [string | undefined, string | undefined];
    await this.render({ plain: `Hello ${username} (password: ${rbInspect(password)})` });
  }

  private authenticate(): unknown {
    return this.authenticateOrRequestWithHttpBasic(undefined, undefined, (username, password) => {
      return username === "lifo" && password === "world";
    });
  }

  private authenticateWithRequest(): unknown {
    if (
      this.authenticateWithHttpBasic(
        (username, password) => username === "pretty" && password === "please",
      )
    ) {
      return (this.loggedIn = true);
    } else {
      return this.requestHttpBasicAuthentication("SuperSecret", "Authentication Failed\n");
    }
  }

  private authWithSpecialChars(): unknown {
    return this.authenticateOrRequestWithHttpBasic(undefined, undefined, (username, password) => {
      return (
        username === "login!@#$%^&*()_+{}[];\"',./<>?`~ \\n\\r\\t" &&
        password === "pwd:!@#$%^&*()_+{}[];\"',./<>?`~ \\n\\r\\t"
      );
    });
  }

  private authenticateLongCredentials(): unknown {
    return this.authenticateOrRequestWithHttpBasic(undefined, undefined, (username, password) => {
      return (
        username === "1234567890123456789012345678901234567890" &&
        password === "1234567890123456789012345678901234567890"
      );
    });
  }
}

const AUTH_HEADERS = [
  "HTTP_AUTHORIZATION",
  "X-HTTP_AUTHORIZATION",
  "X_HTTP_AUTHORIZATION",
  "REDIRECT_X_HTTP_AUTHORIZATION",
];

describe("HttpBasicAuthenticationTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new DummyController();
    await tc.beforeSetup();
  });

  AUTH_HEADERS.forEach((header) => {
    it(`successful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = encodeCredentials("lifo", "world");
      await tc.get("index");

      assertResponse("success");
      expect(tc.response.body, `Authentication failed for request header ${header}`).toBe(
        "Hello Secret",
      );
    });
    it(`successful authentication with ${header.toLowerCase()} and long credentials`, async () => {
      tc.request.env[header] = encodeCredentials(
        "1234567890123456789012345678901234567890",
        "1234567890123456789012345678901234567890",
      );
      await tc.get("show");

      assertResponse("success");
      expect(
        tc.response.body,
        `Authentication failed for request header ${header} and long credentials`,
      ).toBe("Only for loooooong credentials");
    });
  });

  AUTH_HEADERS.forEach((header) => {
    it(`unsuccessful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = encodeCredentials("h4x0r", "world");
      await tc.get("index");

      assertResponse("unauthorized");
      expect(tc.response.body, `Authentication didn't fail for request header ${header}`).toBe(
        "HTTP Basic: Access denied.\n",
      );
    });
    it(`unsuccessful authentication with ${header.toLowerCase()} and long credentials`, async () => {
      tc.request.env[header] = encodeCredentials(
        "h4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0r",
        "worldworldworldworldworldworldworldworld",
      );
      await tc.get("show");

      assertResponse("unauthorized");
      expect(
        tc.response.body,
        `Authentication didn't fail for request header ${header} and long credentials`,
      ).toBe("HTTP Basic: Access denied.\n");
    });

    it(`unsuccessful authentication with ${header.toLowerCase()} and no credentials`, async () => {
      await tc.get("show");

      assertResponse("unauthorized");
      expect(
        tc.response.body,
        `Authentication didn't fail for request header ${header} and no credentials`,
      ).toBe("HTTP Basic: Access denied.\n");
    });
  });

  it("encode credentials has no newline", () => {
    const username = "laskjdfhalksdjfhalkjdsfhalksdjfhklsdjhalksdjfhalksdjfhlakdsjfh";
    const password = "kjfhueyt9485osdfasdkljfh4lkjhakldjfhalkdsjf";
    const result = HttpAuthentication.Basic.encodeCredentials(username, password);
    expect(result).not.toMatch(/\n/);
  });

  it("successful authentication with uppercase authorization scheme", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = `BASIC ${Base64.encode64("lifo:world")}`;
    await tc.get("index");

    assertResponse("success");
    expect(tc.response.body, "Authentication failed when authorization scheme BASIC").toBe(
      "Hello Secret",
    );
  });

  it("authentication request without credential", async () => {
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed\n");
    expect(tc.response.headers.get("WWW-Authenticate")).toBe('Basic realm="SuperSecret"');
  });

  it("authentication request with invalid credential", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials("pretty", "foo");
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed\n");
    expect(tc.response.headers.get("WWW-Authenticate")).toBe('Basic realm="SuperSecret"');
  });

  it("authentication request with a missing password", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = `Basic ${Base64.encode64("David")}`;
    await tc.get("search");

    assertResponse("unauthorized");
  });

  it("authentication request with no required password", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = `Basic ${Base64.encode64("George")}`;
    await tc.get("no_password");

    assertResponse("success");
    expect(tc.response.body).toBe("Hello George (password: nil)");
  });

  it("authentication request with valid credential", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials("pretty", "please");
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with valid credential special chars", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials(
      "login!@#$%^&*()_+{}[];\"',./<>?`~ \\n\\r\\t",
      "pwd:!@#$%^&*()_+{}[];\"',./<>?`~ \\n\\r\\t",
    );
    await tc.get("special_creds");

    assertResponse("success");
    expect(tc.response.body).toBe("Only for special credentials");
  });

  it("authenticate with class method", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials("David", "Goliath");
    await tc.get("search");
    assertResponse("success");

    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials("David", "WRONG!");
    await tc.get("search");
    assertResponse("unauthorized");
  });

  it("authentication request with wrong scheme", async () => {
    const header = "Bearer " + encodeCredentials("David", "Goliath").split(" ", 2)[1];
    tc.request.env["HTTP_AUTHORIZATION"] = header;
    await tc.get("search");
    assertResponse("unauthorized");
  });

  function encodeCredentials(username: string, password: string): string {
    return `Basic ${Base64.encode64(`${username}:${password}`)}`;
  }
});
