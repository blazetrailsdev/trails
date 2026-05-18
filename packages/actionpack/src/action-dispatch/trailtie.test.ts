import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
import { Trailtie, type ActionDispatchConfig } from "./trailtie.js";
import { URL as HttpURL } from "./http/url.js";
import { QueryParser } from "./http/query-parser.js";
import { RequestUtils } from "./request/utils.js";
import { CacheConfig } from "./http/cache.js";
import { X_REQUEST_ID } from "./constants.js";

function cfg(): ActionDispatchConfig {
  return Trailtie.config["actionDispatch"] as ActionDispatchConfig;
}

describe("ActionDispatch::Trailtie", () => {
  let savedConfig: ActionDispatchConfig;
  let savedTldLength: number;
  let savedStrictQuery: boolean | null;
  let savedPerformDeepMunge: boolean;
  let savedStrictFreshness: boolean;
  let hadDeprecator: boolean;
  let savedDeprecator: (typeof BaseRailtie.deprecators)[string];

  beforeEach(() => {
    savedConfig = structuredClone(cfg());
    savedTldLength = HttpURL.tldLength;
    savedStrictQuery = QueryParser.strictQueryStringSeparator;
    savedPerformDeepMunge = RequestUtils.performDeepMunge;
    savedStrictFreshness = CacheConfig.strictFreshness;
    hadDeprecator = "actionDispatch" in BaseRailtie.deprecators;
    savedDeprecator = BaseRailtie.deprecators["actionDispatch"];
  });

  afterEach(() => {
    Trailtie.config["actionDispatch"] = savedConfig;
    HttpURL.tldLength = savedTldLength;
    QueryParser.strictQueryStringSeparator = savedStrictQuery;
    RequestUtils.performDeepMunge = savedPerformDeepMunge;
    CacheConfig.strictFreshness = savedStrictFreshness;
    if (hadDeprecator) BaseRailtie.deprecators["actionDispatch"] = savedDeprecator;
    else delete BaseRailtie.deprecators["actionDispatch"];
  });

  it("registers itself with the Railtie registry", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
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

  it("runInitializers copies config onto framework holders", () => {
    const c = cfg();
    c.tldLength = 2;
    c.strictQueryStringSeparator = true;
    c.performDeepMunge = false;
    c.strictFreshness = true;

    Trailtie.runInitializers();

    expect(HttpURL.tldLength).toBe(2);
    expect(QueryParser.strictQueryStringSeparator).toBe(true);
    expect(RequestUtils.performDeepMunge).toBe(false);
    expect(CacheConfig.strictFreshness).toBe(true);
    expect(BaseRailtie.deprecators["actionDispatch"]).toBeDefined();
  });
});
