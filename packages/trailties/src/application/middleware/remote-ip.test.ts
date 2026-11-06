import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { CachingKeyGenerator, KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { ActionDispatch } from "@blazetrails/actionpack";
import { MockRequest } from "@blazetrails/rack";
import { ArgumentError, IPAddr, include } from "@blazetrails/ruby-compat";
import { assertNotDeprecated, assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { Application } from "../../application.js";
import { Trails } from "../../trails.js";
import type { Generation } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface RemoteIpTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RemoteIpTest extends TestCase {
  async remoteIp(env: Record<string, unknown> = {}): Promise<string | null> {
    let remoteIp: string | null = null;
    env = Object.assign(
      { ...MockRequest.envFor("/"), ...env },
      {
        "action_dispatch.show_exceptions": "none",
        "action_dispatch.key_generator": new CachingKeyGenerator(
          new KeyGenerator("b3c631c314c0bbca50c1b2843150fe33", { iterations: 1000 }),
        ),
      },
    );

    const endpoint = (e: Record<string, unknown>) => {
      remoteIp = new ActionDispatch.Request(e).remoteIp;
      return [200, {}, ["Hello"]];
    };

    const middleware = Trails.application!.middleware as unknown as {
      build(app: typeof endpoint): { call(env: Record<string, unknown>): Promise<unknown> };
    };
    await middleware.build(endpoint).call(env);
    return remoteIp;
  }
}
include(RemoteIpTest, Isolation);

describe("RemoteIpTest", () => {
  let t: RemoteIpTest;
  beforeEach(() => {
    t = new RemoteIpTest("test");
  });

  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("remote_ip works", async () => {
    await t.makeBasicApp();
    expect(await t.remoteIp({ REMOTE_ADDR: "1.1.1.1" })).toBe("1.1.1.1");
  });

  it("checks IP spoofing by default", async () => {
    await t.makeBasicApp();
    await assertRaises([ActionDispatch.RemoteIp.IpSpoofAttackError], {}, () =>
      t.remoteIp({ HTTP_X_FORWARDED_FOR: "1.1.1.1", HTTP_CLIENT_IP: "1.1.1.2" }),
    );
  });

  it("works with both headers individually", async () => {
    await t.makeBasicApp();
    await assertNothingRaised(async () => {
      expect(await t.remoteIp({ HTTP_X_FORWARDED_FOR: "1.1.1.1" })).toBe("1.1.1.1");
    });
    await assertNothingRaised(async () => {
      expect(await t.remoteIp({ HTTP_CLIENT_IP: "1.1.1.2" })).toBe("1.1.1.2");
    });
  });

  it("can disable IP spoofing check", async () => {
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.ipSpoofingCheck = false;
    });

    await assertNothingRaised(async () => {
      expect(await t.remoteIp({ HTTP_X_FORWARDED_FOR: "1.1.1.1", HTTP_CLIENT_IP: "1.1.1.2" })).toBe(
        "1.1.1.1",
      );
    });
  });

  it("remote_ip works with HTTP_X_FORWARDED_FOR", async () => {
    await t.makeBasicApp();
    expect(await t.remoteIp({ REMOTE_ADDR: "1.1.1.1", HTTP_X_FORWARDED_FOR: "4.2.42.42" })).toBe(
      "4.2.42.42",
    );
  });

  it("the user can set trusted proxies with an enumerable of case equality comparable values", async () => {
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.trustedProxies = [
        new IPAddr("4.2.42.0/24"),
        /^4\.2\.42\.43$/,
        "4.2.42.44",
      ];
    });

    await assertNotDeprecated(ActionDispatch.deprecator(), async () => {
      expect(
        await t.remoteIp({
          REMOTE_ADDR: "1.1.1.1",
          HTTP_X_FORWARDED_FOR: "4.2.42.42,4.2.42.43,4.2.42.44",
        }),
      ).toBe("1.1.1.1");
    });
  });

  it("setting trusted proxies replaces the default set of trusted proxies", async () => {
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.trustedProxies = [new IPAddr("4.2.42.0/24")];
    });

    expect(
      await t.remoteIp({ REMOTE_ADDR: "1.1.1.1", HTTP_X_FORWARDED_FOR: "10.0.0.0,4.2.42.42" }),
    ).toBe("10.0.0.0");
  });

  it("setting trusted proxies to a single value (deprecated) adds value to default trusted proxies", async () => {
    const exception = await assertRaises([ArgumentError], {}, () =>
      t.makeBasicApp((app) => {
        app.config.actionDispatch.trustedProxies = new IPAddr("4.2.42.0/24") as never;
      }),
    );

    expect(exception.message).toMatch(
      /Setting config\.action_dispatch\.trusted_proxies to a single value/,
    );
  });
});
