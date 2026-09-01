import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Lint, MockRequest, RACK_SESSION_OPTIONS, Response, Utils } from "@blazetrails/rack";
import { describe, expect, it } from "vitest";

import type { SessionHash } from "./index.js";
import { Pool, SessionId } from "./index.js";

describe("Rack::Session::Pool", () => {
  const sessionKey = Pool.DEFAULT_OPTIONS["key"] as string;
  const sessionMatch = new RegExp(`${sessionKey}=([0-9a-fA-F]+);`);

  const incrementorApp = async (env: RackEnv): Promise<RackResponse> => {
    const session = env["rack.session"] as SessionHash;
    if (session.get("counter") == null) session.set("counter", 0);
    session.set("counter", (session.get("counter") as number) + 1);
    return new Response(session.inspect()).toArray();
  };

  const lint =
    (app: RackApp) =>
    (env: RackEnv): Promise<RackResponse> =>
      new Lint(app).call(env) as Promise<RackResponse>;

  const getSessionId = lint(async (env: RackEnv) =>
    new Response((env["rack.session"] as SessionHash).inspect()).toArray(),
  );

  const nothing = lint(async () => new Response("Nothing").toArray());

  const dropSession = lint(async (env: RackEnv) => {
    (env[RACK_SESSION_OPTIONS] as Record<string, unknown>)["drop"] = true;
    return incrementorApp(env);
  });

  const renewSession = lint(async (env: RackEnv) => {
    (env[RACK_SESSION_OPTIONS] as Record<string, unknown>)["renew"] = true;
    return incrementorApp(env);
  });

  const deferSession = lint(async (env: RackEnv) => {
    (env[RACK_SESSION_OPTIONS] as Record<string, unknown>)["defer"] = true;
    return incrementorApp(env);
  });

  const incrementor = lint(incrementorApp);

  it("creates a new cookie", async () => {
    const pool = new Pool(incrementor);
    const res = await new MockRequest((env) => pool.call(env)).get("/");
    expect(res.headers["set-cookie"]).toMatch(sessionMatch);
    expect(res.bodyString).toBe('{"counter"=>1}');
  });

  it("determines session from a cookie", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));
    const cookie = (await req.get("/")).headers["set-cookie"] as string;
    expect((await req.get("/", { HTTP_COOKIE: cookie })).bodyString).toBe('{"counter"=>2}');
    expect((await req.get("/", { HTTP_COOKIE: cookie })).bodyString).toBe('{"counter"=>3}');
  });

  it("survives nonexistent cookies", async () => {
    const pool = new Pool(incrementor);
    const res = await new MockRequest((env) => pool.call(env)).get("/", {
      HTTP_COOKIE: `${sessionKey}=blarghfasel`,
    });
    expect(res.bodyString).toBe('{"counter"=>1}');
  });

  it("does not send the same session id if it did not change", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));

    const res0 = await req.get("/");
    const cookie = (res0.headers["set-cookie"] as string).match(sessionMatch)![0];
    expect(res0.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res1 = await req.get("/", { HTTP_COOKIE: cookie });
    expect(res1.headers["set-cookie"]).toBeUndefined();
    expect(res1.bodyString).toBe('{"counter"=>2}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res2 = await req.get("/", { HTTP_COOKIE: cookie });
    expect(res2.headers["set-cookie"]).toBeUndefined();
    expect(res2.bodyString).toBe('{"counter"=>3}');
    expect(Object.keys(pool.pool).length).toBe(1);
  });

  it("deletes cookies with :drop option", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));
    const drop = new Utils.Context(pool, dropSession);
    const dreq = new MockRequest((env) => drop.call(env));

    const res1 = await req.get("/");
    const cookie = res1.headers["set-cookie"] as string;
    const session = cookie.match(sessionMatch)![0];
    expect(res1.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res2 = await dreq.get("/", { HTTP_COOKIE: cookie });
    expect(res2.headers["set-cookie"]).toBeUndefined();
    expect(res2.bodyString).toBe('{"counter"=>2}');
    expect(Object.keys(pool.pool).length).toBe(0);

    const res3 = await req.get("/", { HTTP_COOKIE: cookie });
    expect((res3.headers["set-cookie"] as string).match(sessionMatch)![0]).not.toBe(session);
    expect(res3.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(1);
  });

  it("provides new session id with :renew option", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));
    const renew = new Utils.Context(pool, renewSession);
    const rreq = new MockRequest((env) => renew.call(env));

    const res1 = await req.get("/");
    const cookie = res1.headers["set-cookie"] as string;
    const session = cookie.match(sessionMatch)![0];
    expect(res1.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res2 = await rreq.get("/", { HTTP_COOKIE: cookie });
    const newCookie = res2.headers["set-cookie"] as string;
    const newSession = newCookie.match(sessionMatch)![0];
    expect(newSession).not.toBe(session);
    expect(res2.bodyString).toBe('{"counter"=>2}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res3 = await req.get("/", { HTTP_COOKIE: newCookie });
    expect(res3.bodyString).toBe('{"counter"=>3}');
    expect(Object.keys(pool.pool).length).toBe(1);

    const res4 = await req.get("/", { HTTP_COOKIE: cookie });
    expect(res4.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(2);
  });

  it("omits cookie with :defer option", async () => {
    const pool = new Pool(incrementor);
    const defer = new Utils.Context(pool, deferSession);
    const dreq = new MockRequest((env) => defer.call(env));

    const res1 = await dreq.get("/");
    expect(res1.headers["set-cookie"]).toBeUndefined();
    expect(res1.bodyString).toBe('{"counter"=>1}');
    expect(Object.keys(pool.pool).length).toBe(1);
  });

  it("can read the session with the legacy id", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));

    const res0 = await req.get("/");
    const cookie = res0.headers["set-cookie"] as string;
    const sessionId = new SessionId(cookie.match(sessionMatch)![1]);
    const ses0 = pool.pool[sessionId.privateId];
    pool.pool[sessionId.publicId] = ses0;
    delete pool.pool[sessionId.privateId];

    const res1 = await req.get("/", { HTTP_COOKIE: cookie });
    expect(res1.headers["set-cookie"]).toBeUndefined();
    expect(res1.bodyString).toBe('{"counter"=>2}');
    expect(pool.pool[sessionId.privateId]).not.toBeUndefined();
  });

  it("cannot read the session with the legacy id if allow_fallback: false option is used", async () => {
    const pool = new Pool(incrementor, { allowFallback: false });
    const req = new MockRequest((env) => pool.call(env));

    const res0 = await req.get("/");
    const cookie = res0.headers["set-cookie"] as string;
    const sessionId = new SessionId(cookie.match(sessionMatch)![1]);
    const ses0 = pool.pool[sessionId.privateId];
    pool.pool[sessionId.publicId] = ses0;
    delete pool.pool[sessionId.privateId];

    const res1 = await req.get("/", { HTTP_COOKIE: cookie });
    expect(res1.headers["set-cookie"]).not.toBeUndefined();
    expect(res1.bodyString).toBe('{"counter"=>1}');
  });

  it("drops the session in the legacy id as well", async () => {
    const pool = new Pool(incrementor);
    const req = new MockRequest((env) => pool.call(env));
    const drop = new Utils.Context(pool, dropSession);
    const dreq = new MockRequest((env) => drop.call(env));

    const res0 = await req.get("/");
    const cookie = res0.headers["set-cookie"] as string;
    const sessionId = new SessionId(cookie.match(sessionMatch)![1]);
    const ses0 = pool.pool[sessionId.privateId];
    pool.pool[sessionId.publicId] = ses0;
    delete pool.pool[sessionId.privateId];

    const res2 = await dreq.get("/", { HTTP_COOKIE: cookie });
    expect(res2.headers["set-cookie"]).toBeUndefined();
    expect(res2.bodyString).toBe('{"counter"=>2}');
    expect(pool.pool[sessionId.privateId]).toBeUndefined();
    expect(pool.pool[sessionId.publicId]).toBeUndefined();
  });

  it("passes through same_site option to session pool", async () => {
    const pool = new Pool(incrementor, { sameSite: "none" });
    expect(pool.sameSite).toBe("none");
    const req = new MockRequest((env) => pool.call(env));
    const res = await req.get("/");
    expect(res.headers["set-cookie"]).toMatch(/SameSite=None/i);
  });

  it("allows using a lambda to specify same_site option, because some browsers require different settings", async () => {
    let pool = new Pool(incrementor, { sameSite: () => "none" });
    let req = new MockRequest((env) => pool.call(env));
    let res = await req.get("/");
    expect(res.headers["set-cookie"]).toMatch(/SameSite=None/i);

    pool = new Pool(incrementor, { sameSite: () => "lax" });
    req = new MockRequest((env) => pool.call(env));
    res = await req.get("/");
    expect(res.headers["set-cookie"]).toMatch(/SameSite=Lax/i);
  });

  it.skip("should merge sessions when multithreaded", () => {
    // PERMANENT-SKIP: porting the trivial non-$DEBUG arm alone reds parity:test:assertions — the Ruby body counts 6 assertions statically, and the other 5 are Thread.new/Thread.stop/join
  });

  it("does not return a cookie if cookie was not read/written", async () => {
    const app = new Pool(nothing);
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("does not return a cookie if cookie was not written (only read)", async () => {
    const app = new Pool(getSessionId);
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("returns even if not read/written if :expire_after is set", async () => {
    const app = new Pool(nothing, { expireAfter: 3600 });
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      "rack.session": { not: "empty" },
    });
    expect(res.headers["set-cookie"]).toSatisfy((v: unknown) => v != null);
  });

  it("returns no cookie if no data was written and no session was created previously, even if :expire_after is set", async () => {
    const app = new Pool(nothing, { expireAfter: 3600 });
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
