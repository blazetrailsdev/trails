import { Time } from "@blazetrails/date";
import { Request, type RackEnv, type RackResponse } from "@blazetrails/rack";
import { inspect } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export class FakeApp {
  async call(env: RackEnv): Promise<RackResponse> {
    const res = this.handle(env);
    const [, h, b] = res;
    let length = 0;
    for (const s of b) length += s.length;
    h["content-length"] = String(length);
    h["content-type"] = "text/html;charset=utf-8";
    return res;
  }

  /** @internal */
  private newCookieCount(req: Request): string {
    const oldValue = parseInt(req.cookies["count"] ?? "", 10) || 0;
    return String(oldValue + 1);
  }

  /** @internal */
  private handle(env: RackEnv): [number, Record<string, string | string[]>, string[]] {
    const method = env["REQUEST_METHOD"] as string;
    const path = env["PATH_INFO"] as string;
    const req = new Request(env);
    const params = req.params;
    const session = env["rack.session"];

    if (path === "/") {
      switch (method) {
        case "HEAD":
        case "OPTIONS":
          return [200, {}, []];
        default:
          return [200, {}, [`Hello, ${method}: ${inspect(params)}`]];
      }
    }

    if (path === "/redirect" && method === "GET") {
      return [301, { location: "/redirected" }, []];
    }

    if (path === "/nested/redirect" && method === "GET") {
      return [301, { location: "redirected" }, []];
    }

    if (path === "/nested/redirected" && method === "GET") {
      return [200, {}, ["Hello World!"]];
    }

    if (path === "/absolute/redirect" && method === "GET") {
      return [301, { location: "https://www.google.com" }, []];
    }

    if (path === "/redirect" && method === "POST") {
      if (params["status"]) {
        return [Number(params["status"]), { location: "/redirected" }, []];
      } else {
        return [302, { location: "/redirected" }, []];
      }
    }

    if (path === "/redirect-with-cookie" && method === "GET") {
      return [302, { "set-cookie": "value=1; path=/cookies;", location: "/cookies/show" }, []];
    }

    if (path === "/redirected") {
      const additionalInfo =
        method === "GET"
          ? `, session ${inspect(session as Record<string, unknown>)} with options ${inspect(env["rack.session.options"] as Record<string, unknown>)}`
          : ` using ${method.toLowerCase()} with ${params}`;
      return [200, {}, [`You've been redirected${additionalInfo}`]];
    }

    if (path === "/void" && method === "GET") {
      return [200, {}, []];
    }

    if (
      [
        "/cookies/show",
        "/COOKIES/show",
        "/not-cookies/show",
        "/cookies/default-path",
        "/cookies/default-path/sub",
      ].includes(path) &&
      method === "GET"
    ) {
      return [200, {}, [inspect(req.cookies)]];
    }

    if (path === "/cookies/set-secure" && method === "GET") {
      return [200, { "set-cookie": `secure-cookie=${required(params["value"])}; secure` }, ["Set"]];
    }

    if (
      (path === "/cookies/set-simple" && method === "GET") ||
      (path === "/cookies/default-path" && method === "POST")
    ) {
      return [200, { "set-cookie": `simple=${required(params["value"])};` }, ["Set"]];
    }

    if (path === "/cookies/delete" && method === "GET") {
      return [200, { "set-cookie": `value=; expires=${Time.at(0).httpdate()}` }, []];
    }

    if (path === "/cookies/count" && method === "GET") {
      const newValue = this.newCookieCount(req);
      return [200, { "set-cookie": `count=${newValue};` }, [newValue]];
    }

    if (path === "/cookies/set" && method === "GET") {
      return [
        200,
        {
          "set-cookie": `value=${required(params["value"])}; path=/cookies; expires=${Time.now().plus(10).httpdate()}`,
        },
        ["Set"],
      ];
    }

    if (path === "/cookies/domain" && method === "GET") {
      const newValue = this.newCookieCount(req);
      return [200, { "set-cookie": `count=${newValue}; domain=localhost.com` }, [newValue]];
    }

    if (path === "/cookies/subdomain" && method === "GET") {
      const newValue = this.newCookieCount(req);
      return [200, { "set-cookie": `count=${newValue}; domain=.example.org` }, [newValue]];
    }

    if (path === "/cookies/set-uppercase" && method === "GET") {
      return [
        200,
        {
          "set-cookie": `VALUE=${required(params["value"])}; path=/cookies; expires=${Time.now().plus(10).httpdate()}`,
        },
        ["Set"],
      ];
    }

    if (path === "/cookies/set-multiple" && method === "GET") {
      const value = ["key1=value1", "key2=value2"];
      return [200, { "set-cookie": value }, ["Set"]];
    }

    return [404, {}, []];
  }
}

/** @noRailsEquivalent PERMANENT */
function required(value: unknown): unknown {
  if (value == null || value === false) throw new Error("unhandled exception");
  return value;
}

/** @noRailsEquivalent PERMANENT */
export class InputRewinder {
  /** @internal */
  private readonly app: (env: RackEnv) => Promise<RackResponse>;

  constructor(app: (env: RackEnv) => Promise<RackResponse>) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const input = env["rack.input"] as { rewind(): void } | undefined;
    try {
      return await this.app(env);
    } finally {
      if (input) {
        input.rewind();
        env["rack.input"] = input;
        delete env["rack.request.form_hash"];
      }
    }
  }
}

const fakeApp = new FakeApp();
const inputRewinder = new InputRewinder((env: RackEnv) => fakeApp.call(env));
export const FAKE_APP = (env: RackEnv) => inputRewinder.call(env);
