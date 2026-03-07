import { describe, it, expect } from "vitest";
import { AuthBasic } from "./auth-basic.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Auth::Basic", () => {
  const realm = "WallysWorld";

  const unprotectedApp = async (env: Record<string, any>) =>
    [200, { "content-type": "text/plain" }, [`Hi ${env["REMOTE_USER"]}`]] as any;

  function protectedApp() {
    const app = new AuthBasic(unprotectedApp, (username) => username === "Boss");
    app.realm = realm;
    return app;
  }

  function basicAuth(username: string, password: string): string {
    return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  it("challenge correctly when no credentials are specified", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(new RegExp(`Basic realm="${realm}"`));
    expect(res.bodyString).toBe("");
  });

  it("rechallenge if incorrect credentials are specified", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {
      HTTP_AUTHORIZATION: basicAuth("joe", "password"),
    });
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(new RegExp(`Basic realm="${realm}"`));
  });

  it("return application output if correct credentials are specified", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {
      HTTP_AUTHORIZATION: basicAuth("Boss", "password"),
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hi Boss");
  });

  it("return 400 Bad Request if different auth scheme used", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {
      HTTP_AUTHORIZATION: "Digest params",
    });
    expect(res.status).toBe(400);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("return 400 Bad Request for a malformed authorization header", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {
      HTTP_AUTHORIZATION: "",
    });
    expect(res.status).toBe(400);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("return 401 Bad Request for a nil authorization header", async () => {
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {});
    expect(res.status).toBe(401);
  });

  it("return 400 Bad Request for a authorization header with only username", async () => {
    const auth = "Basic " + Buffer.from("foo").toString("base64");
    const res = await new MockRequest((env) => protectedApp().call(env)).get("/", {
      HTTP_AUTHORIZATION: auth,
    });
    expect(res.status).toBe(400);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("takes realm as optional constructor arg", () => {
    const app = new AuthBasic(unprotectedApp, realm, () => true);
    expect(app.realm).toBe(realm);
  });
});
