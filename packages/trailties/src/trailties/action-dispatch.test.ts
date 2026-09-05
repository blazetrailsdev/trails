import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Deprecators } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import {
  Trailtie,
  type ActionDispatchConfig,
  type ContentSecurityPolicyConfig,
} from "./action-dispatch.js";
import { URL as HttpURL } from "@blazetrails/actionpack";
import { QueryParser } from "@blazetrails/actionpack";
import { RequestUtils } from "@blazetrails/actionpack";
import { CacheConfig } from "@blazetrails/actionpack";
import { Response } from "@blazetrails/actionpack";
import { X_REQUEST_ID } from "@blazetrails/actionpack";

function cfg(): ActionDispatchConfig {
  return Trailtie.config.get("actionDispatch") as ActionDispatchConfig;
}

describe("ActionDispatch::Trailtie", () => {
  let savedConfig: ActionDispatchConfig;
  let savedCspConfig: ContentSecurityPolicyConfig;
  let savedTldLength: number;
  let savedStrictQuery: boolean | null;
  let savedPerformDeepMunge: boolean;
  let savedStrictFreshness: boolean;
  let savedDefaultCharset: string;
  let app: { deprecators: Deprecators };

  beforeEach(() => {
    savedConfig = structuredClone(cfg());
    savedCspConfig = {
      ...(Trailtie.config.get("contentSecurityPolicy") as ContentSecurityPolicyConfig),
    };
    savedTldLength = HttpURL.tldLength;
    savedStrictQuery = QueryParser.strictQueryStringSeparator;
    savedPerformDeepMunge = RequestUtils.performDeepMunge;
    savedStrictFreshness = CacheConfig.strictFreshness;
    savedDefaultCharset = Response.defaultCharset;
    app = { deprecators: new Deprecators() };
  });

  afterEach(() => {
    Trailtie.config.set("actionDispatch", savedConfig);
    Trailtie.config.set("contentSecurityPolicy", savedCspConfig);
    HttpURL.tldLength = savedTldLength;
    QueryParser.strictQueryStringSeparator = savedStrictQuery;
    RequestUtils.performDeepMunge = savedPerformDeepMunge;
    CacheConfig.strictFreshness = savedStrictFreshness;
    Response.defaultCharset = savedDefaultCharset;
  });

  it("registers itself with the Railtie registry", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("seeds Rails-compatible defaults on config.actionDispatch", () => {
    const c = cfg();
    expect(c.ipSpoofingCheck).toBe(true);
    expect(c.showExceptions).toBe("all");
    expect(c.tldLength).toBe(1);
    expect(c.performDeepMunge).toBe(true);
    expect(c.requestIdHeader).toBe(X_REQUEST_ID);
    expect(c.debugExceptionLogLevel).toBe("fatal");
    expect(c.httpAuthSalt).toBe("http authentication");
    expect(c.defaultHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(c.cookiesRotations).toBeNull();
  });

  it("runInitializers copies config onto framework holders", async () => {
    const c = cfg();
    c.tldLength = 2;
    c.strictQueryStringSeparator = true;
    c.performDeepMunge = false;
    c.strictFreshness = true;

    await runTrailtieInitializers(Trailtie, app);

    expect(HttpURL.tldLength).toBe(2);
    expect(QueryParser.strictQueryStringSeparator).toBe(true);
    expect(RequestUtils.performDeepMunge).toBe(false);
    expect(CacheConfig.strictFreshness).toBe(true);
    expect(app.deprecators.get("actionDispatch")).toBeDefined();
  });

  it("runInitializers copies defaultCharset onto Response when configured", async () => {
    cfg().defaultCharset = "iso-8859-1";
    await runTrailtieInitializers(Trailtie, app);
    expect(Response.defaultCharset).toBe("iso-8859-1");
  });

  it("seeds Rails-compatible defaults on config.contentSecurityPolicy", () => {
    const c = Trailtie.config.get("contentSecurityPolicy") as ContentSecurityPolicyConfig;
    expect(c.policy).toBeNull();
    expect(c.reportOnly).toBe(false);
    expect(c.nonceGenerator).toBeNull();
    expect(c.nonceDirectives).toBeNull();
  });

  it("runInitializers resets Response.defaultCharset to utf-8 when cfg is null", async () => {
    Response.defaultCharset = "stale";
    cfg().defaultCharset = null;
    await runTrailtieInitializers(Trailtie, app);
    expect(Response.defaultCharset).toBe("utf-8");
  });
});
