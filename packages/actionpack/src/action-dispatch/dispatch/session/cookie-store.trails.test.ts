import { describe, expect, it } from "vitest";
import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import { Cookies, COOKIES_APP_OPTIONS_KEY } from "../../middleware/cookies.js";
import { CookieStore } from "../../middleware/session/cookie-store.js";
import { Request } from "../../http/request.js";

async function* body(text: string): RackBody {
  yield text;
}

async function read(rackBody: RackBody): Promise<string> {
  let out = "";
  for await (const chunk of rackBody) out += String(chunk);
  return out;
}

describe("CookieStore in a real stack", () => {
  function stack(): (env: RackEnv) => Promise<RackResponse> {
    const app = async (env: RackEnv): Promise<RackResponse> => {
      const request = new Request(env);
      const session = request.session as unknown as {
        get(key: string): unknown;
        set(key: string, value: unknown): void;
      };
      const seen = (session.get("counter") as number | undefined) ?? 0;
      session.set("counter", seen + 1);
      return [200, { "content-type": "text/plain" }, body(String(seen))];
    };
    const store = new CookieStore(app, { key: "_session" });
    const cookies = new Cookies((env: RackEnv) => store.call(env));
    return (env: RackEnv) => cookies.call(env);
  }

  function env(cookie?: string): RackEnv {
    return {
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "test.host",
      HTTP_COOKIE: cookie ?? "",
      [COOKIES_APP_OPTIONS_KEY]: { secret: "a".repeat(64) },
    } as unknown as RackEnv;
  }

  it("round-trips session data across two requests through the cookie", async () => {
    const app = stack();

    const first = await app(env());
    expect(await read(first[2])).toBe("0");

    const setCookie = String(first[1]["set-cookie"] ?? "");
    expect(setCookie).toContain("_session=");

    const second = await app(env(setCookie.split(";")[0]));
    expect(await read(second[2])).toBe("1");
  });
});
