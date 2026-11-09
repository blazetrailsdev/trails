import { Configuration } from "../../lib/application/configuration.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Deprecators } from "@blazetrails/activesupport";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Trailtie as BaseTrailtie } from "../../lib/trailtie.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie, type ActionDispatchConfig } from "../../lib/trailties/action-dispatch.js";
import { URL as HttpURL } from "@blazetrails/actionpack";
import { QueryParser } from "@blazetrails/actionpack";
import { Request } from "@blazetrails/actionpack";
import { CacheRequest } from "@blazetrails/actionpack";
import { Response } from "@blazetrails/actionpack";
import { X_REQUEST_ID, ParamBuilder, CookieJar } from "@blazetrails/actionpack";

function cfg(): ActionDispatchConfig {
  return Trailtie.config.get("actionDispatch") as ActionDispatchConfig;
}

describe("ActionDispatch::Trailtie", () => {
  let savedConfig: ActionDispatchConfig;
  let savedTldLength: number;
  let savedStrictQuery: boolean | null | undefined;
  let savedPerformDeepMunge: boolean;
  let savedStrictFreshness: boolean;
  let savedDefaultCharset: string | null;
  let savedDefaultHeaders: Record<string, string> | undefined;
  let savedIgnoreLeadingBrackets: boolean | null | undefined;
  let savedIgnoreAcceptHeader: boolean;
  let savedAlwaysWriteCookie: boolean;
  let app: { deprecators: Deprecators; config: Configuration };

  beforeEach(() => {
    savedConfig = { ...cfg() };
    savedTldLength = HttpURL.tldLength;
    savedStrictQuery = QueryParser.strictQueryStringSeparator;
    savedPerformDeepMunge = Request.Utils.performDeepMunge;
    savedStrictFreshness = CacheRequest.strictFreshness;
    savedDefaultCharset = Response.defaultCharset;
    savedDefaultHeaders = Response.defaultHeaders;
    savedIgnoreLeadingBrackets = ParamBuilder.ignoreLeadingBrackets;
    savedIgnoreAcceptHeader = Request.ignoreAcceptHeader;
    savedAlwaysWriteCookie = CookieJar.alwaysWriteCookie;
    app = { deprecators: new Deprecators(), config: new Configuration("/app") };
  });

  afterEach(() => {
    Trailtie.config.set("actionDispatch", savedConfig);
    HttpURL.tldLength = savedTldLength;
    QueryParser.strictQueryStringSeparator = savedStrictQuery;
    Request.Utils.performDeepMunge = savedPerformDeepMunge;
    CacheRequest.strictFreshness = savedStrictFreshness;
    Response.defaultCharset = savedDefaultCharset;
    Response.defaultHeaders = savedDefaultHeaders;
    ParamBuilder.ignoreLeadingBrackets = savedIgnoreLeadingBrackets;
    Request.ignoreAcceptHeader = savedIgnoreAcceptHeader;
    CookieJar.alwaysWriteCookie = savedAlwaysWriteCookie;
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
    expect(c.debugExceptionLogLevel).toBe(":fatal");
    expect(c.httpAuthSalt).toBe("http authentication");
    expect(c.defaultHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(c.cookiesRotations).toBeInstanceOf(RotationConfiguration);
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
    expect(Request.Utils.performDeepMunge).toBe(false);
    expect(CacheRequest.strictFreshness).toBe(true);
    expect(app.deprecators.get("actionDispatch")).toBeDefined();
  });

  it("runInitializers copies defaultCharset onto Response when configured", async () => {
    cfg().defaultCharset = "iso-8859-1";
    await runTrailtieInitializers(Trailtie, app);
    expect(Response.defaultCharset).toBe("iso-8859-1");
  });

  it("runInitializers resets Response.defaultCharset to utf-8 when cfg is null", async () => {
    Response.defaultCharset = "stale";
    cfg().defaultCharset = null;
    await runTrailtieInitializers(Trailtie, app);
    expect(Response.defaultCharset).toBe("utf-8");
  });

  it("runInitializers copies ignoreLeadingBrackets onto ParamBuilder", async () => {
    cfg().ignoreLeadingBrackets = true;
    await runTrailtieInitializers(Trailtie, app);
    expect(ParamBuilder.ignoreLeadingBrackets).toBe(true);
  });

  it("runInitializers copies defaultHeaders onto Response and ignoreAcceptHeader onto Request", async () => {
    cfg().defaultHeaders = { "X-Test": "1" };
    cfg().ignoreAcceptHeader = true;
    await runTrailtieInitializers(Trailtie, app);
    expect(Response.defaultHeaders).toEqual({ "X-Test": "1" });
    expect(Request.ignoreAcceptHeader).toBe(true);
  });
});
