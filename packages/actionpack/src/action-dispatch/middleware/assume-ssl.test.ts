import { describe, it, expect } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { AssumeSSL } from "./assume-ssl.js";

describe("AssumeSSLTest", () => {
  it("sets expected headers", async () => {
    const env: RackEnv = {};
    const app = async (_env: RackEnv): Promise<RackResponse> => [200, {}, bodyFromString("")];
    await new AssumeSSL(app).call(env);

    expect(env["HTTPS"]).toBe("on");
    expect(env["HTTP_X_FORWARDED_PORT"]).toBe("443");
    expect(env["HTTP_X_FORWARDED_PROTO"]).toBe("https");
    expect(env["rack.url_scheme"]).toBe("https");
  });
});
