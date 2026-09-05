import { describe, expect, it, beforeEach } from "vitest";
import { include, type Included } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { FAKE_APP } from "./fixtures/fake-app.js";
import { Methods, type MethodsHost, Session } from "./index.js";

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Methods`; the class/interface merge is how a mixin surfaces on the type side. */
interface Spec extends Included<typeof Methods> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class Spec implements MethodsHost {
  app: RackApp = FAKE_APP;

  declare buildRackMockSession?: () => Session;
  declare defaultHost?: string;
}
include(Spec, Methods);

let spec: Spec;

beforeEach(() => {
  spec = new Spec();
});

describe("Rack::Test::Methods", () => {
  it("#rack_mock_session always creates new session if passed nil/false", () => {
    expect(spec.rackMockSession(null)).not.toBe(spec.rackMockSession(null));
    expect(spec.rackMockSession(false)).not.toBe(spec.rackMockSession(false));
  });

  it("#rack_mock_session reuses existing session if passed truthy value", () => {
    expect(spec.rackMockSession(true)).toBe(spec.rackMockSession(true));
    expect(spec.rackMockSession(":true")).toBe(spec.rackMockSession(":true"));
  });

  it("#rack_test_session always creates new session if passed nil/false", () => {
    expect(spec.rackTestSession(null)).not.toBe(spec.rackTestSession(null));
    expect(spec.rackTestSession(false)).not.toBe(spec.rackTestSession(false));
  });

  it("#rack_test_session reuses existing session if passed truthy value", () => {
    expect(spec.rackTestSession(true)).toBe(spec.rackTestSession(true));
    expect(spec.rackTestSession(":true")).toBe(spec.rackTestSession(":true"));
  });

  it("#build_rack_mock_session will be used if present", () => {
    const session = Session.new(spec.app);
    spec.buildRackMockSession = () => session;
    expect(spec.currentSession()).toBe(session);
  });

  it("#build_rack_test_session will use defined app", async () => {
    const envs: RackEnv[] = [];
    const app: RackApp = async (env): Promise<RackResponse> => {
      envs.push(env);
      return [200, {}, bodyFromString("")];
    };
    spec.app = app;

    await spec.get("/");
    expect(envs[0]["PATH_INFO"]).toEqual("/");
    expect(envs[0]["HTTP_HOST"]).toEqual("example.org");
  });

  it("#build_rack_test_session will use defined default_host", async () => {
    const envs: RackEnv[] = [];
    const app: RackApp = async (env): Promise<RackResponse> => {
      envs.push(env);
      return [200, {}, bodyFromString("")];
    };
    spec.app = app;
    spec.defaultHost = "foo.example.com";

    await spec.get("/");
    expect(envs[0]["PATH_INFO"]).toEqual("/");
    expect(envs[0]["HTTP_HOST"]).toEqual("foo.example.com");
  });
});
