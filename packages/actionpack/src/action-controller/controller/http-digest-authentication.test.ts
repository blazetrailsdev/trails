import { beforeEach, describe, it, expect } from "vitest";
import { reverseMergeBang } from "@blazetrails/activesupport";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { hashDelete, OpenSSL } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { HttpAuthentication, type DigestCredentials } from "../metal/http-authentication.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

const { Digest } = HttpAuthentication;

class DummyDigestController extends Base {
  declare loggedIn: boolean;

  static {
    this.beforeAction("authenticate", { only: "index" });
    this.beforeAction("authenticateWithRequest", { only: "display" });
  }

  static USERS: Record<string, string> = {
    lifo: "world",
    pretty: "please",
    dhh: OpenSSL.Digest.MD5.hexdigest(["dhh", "SuperSecret", "secret"].join(":")),
  };

  async index(): Promise<void> {
    await this.render({ plain: "Hello Secret" });
  }

  async display(): Promise<void> {
    if (this.loggedIn) await this.render({ plain: "Definitely Maybe" });
  }

  private authenticate(): unknown {
    return this.authenticateOrRequestWithHttpDigest("SuperSecret", undefined, (username) => {
      return DummyDigestController.USERS[username];
    });
  }

  private authenticateWithRequest(): unknown {
    if (
      this.authenticateWithHttpDigest(
        "SuperSecret",
        (username) => DummyDigestController.USERS[username],
      )
    ) {
      return (this.loggedIn = true);
    } else {
      return this.requestHttpDigestAuthentication("SuperSecret", "Authentication Failed");
    }
  }
}

const AUTH_HEADERS = [
  "HTTP_AUTHORIZATION",
  "X-HTTP_AUTHORIZATION",
  "X_HTTP_AUTHORIZATION",
  "REDIRECT_X_HTTP_AUTHORIZATION",
];

describe("HttpDigestAuthenticationTest", () => {
  let tc: TestCase;
  let secret: string;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new DummyDigestController();
    await tc.beforeSetup();
    secret = "4fb45da9e4ab4ddeb7580d6a35503d99";
    tc.request.env["action_dispatch.key_generator"] = new CachingKeyGenerator(
      new KeyGenerator(secret),
    );
    tc.request.env["action_dispatch.http_auth_salt"] = "http authentication";
  });

  AUTH_HEADERS.forEach((header) => {
    it(`successful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = await encodeCredentials({ username: "lifo", password: "world" });
      await tc.get("index");

      assertResponse("success");
      expect(tc.response.body, `Authentication failed for request header ${header}`).toBe(
        "Hello Secret",
      );
    });
  });

  AUTH_HEADERS.forEach((header) => {
    it(`unsuccessful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = await encodeCredentials({ username: "h4x0r", password: "world" });
      await tc.get("index");

      assertResponse("unauthorized");
      expect(tc.response.body, `Authentication didn't fail for request header ${header}`).toBe(
        "HTTP Digest: Access denied.\n",
      );
    });
  });

  it("authentication request without credential", async () => {
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed");
    const credentials = decodeCredentials(tc.response.headers.get("WWW-Authenticate"));
    expect(credentials.get("realm")).toBe("SuperSecret");
  });

  it("authentication request with nil credentials", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: null,
      password: null,
    });
    await tc.get("index");

    assertResponse("unauthorized");
    expect(tc.response.body, "Authentication didn't fail for request").toBe(
      "HTTP Digest: Access denied.\n",
    );
    expect(tc.response.body, "Authentication didn't fail for request").not.toBe("Hello Secret");
  });

  it("authentication request with invalid password", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "foo",
    });
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed");
  });

  it("authentication request with invalid nonce", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
      nonce: "xxyyzz",
    });
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed");
  });

  it("authentication request with invalid opaque", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "foo",
      opaque: "xxyyzz",
    });
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed");
  });

  it("authentication request with invalid realm", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "foo",
      realm: "NotSecret",
    });
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed");
  });

  it("authentication request with valid credential", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with valid credential and nil session", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });

    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with request-uri that doesn't match credentials digest-uri", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });
    tc.request.env["PATH_INFO"] = "/proxied/uri";
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with absolute request uri (as in webrick)", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });
    tc.request.env["SERVER_NAME"] = "test.host";
    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest";

    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with absolute uri in credentials (as in IE)", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      url: "http://test.host/http_digest_authentication_test/dummy_digest",
      username: "pretty",
      password: "please",
    });

    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with absolute uri in both request and credentials (as in Webrick with IE)", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      url: "http://test.host/http_digest_authentication_test/dummy_digest",
      username: "pretty",
      password: "please",
    });
    tc.request.env["SERVER_NAME"] = "test.host";
    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest";

    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with password stored as ha1 digest hash", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "dhh",
      password: OpenSSL.Digest.MD5.hexdigest(["dhh", "SuperSecret", "secret"].join(":")),
      password_is_ha1: true,
    });
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with _method", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
      method: "post",
    });
    tc.request.env["rack.methodoverride.original_method"] = "POST";
    await tc.put("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("validate_digest_response should fail with nil returning password_procedure", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: null,
      password: null,
    });
    expect(Digest.validateDigestResponse(tc.request, "SuperSecret", () => null)).toBeFalsy();
  });

  it("authentication request with request-uri ending in '/'", async () => {
    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest/";
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });

    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest";
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with request-uri ending in '?'", async () => {
    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest/?";
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      username: "pretty",
      password: "please",
    });

    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest";
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("authentication request with absolute uri in credentials (as in IE) ending with /", async () => {
    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest/";
    tc.request.env["HTTP_AUTHORIZATION"] = await encodeCredentials({
      uri: "http://test.host/http_digest_authentication_test/dummy_digest/",
      username: "pretty",
      password: "please",
    });

    tc.request.env["PATH_INFO"] = "/http_digest_authentication_test/dummy_digest";
    await tc.get("display");

    assertResponse("success");
    expect(tc.response.body).toBe("Definitely Maybe");
  });

  it("when sent a basic auth header, returns Unauthorized", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = "Basic Gwf2aXq8ZLF3Hxq=";

    await tc.get("display");

    assertResponse("unauthorized");
  });

  async function encodeCredentials(options: Record<string, unknown>): Promise<string> {
    reverseMergeBang(options, { nc: "00000001", cnonce: "0a4f113b", password_is_ha1: false });
    const password = hashDelete(options, "password") as string;

    const method = (hashDelete(options, "method") as string | null) || "GET";

    switch (String(method).toUpperCase()) {
      case "GET":
        await tc.get("index");
        break;
      case "POST":
        await tc.post("index");
        break;
    }

    assertResponse("unauthorized");

    const credentials = decodeCredentials(tc.response.headers.get("WWW-Authenticate"));
    credentials.mergeBang(options);
    const pathInfo = String(tc.request.env["PATH_INFO"] ?? "");
    const uri = (options.uri as string | undefined) || pathInfo;
    credentials.set("uri", uri);
    tc.request.env["ORIGINAL_FULLPATH"] = pathInfo;
    return Digest.encodeCredentials(
      method,
      credentials,
      password,
      options.password_is_ha1 as boolean,
    );
  }

  function decodeCredentials(header: string | null | undefined): DigestCredentials {
    return Digest.decodeCredentials(header);
  }
});
