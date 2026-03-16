import { describe, it } from "vitest";

describe("SessionTest", () => {
  it.skip("https bang works and sets truth by default", () => {});
  it.skip("host!", () => {});
  it.skip("follow redirect raises when no redirect", () => {});
  it.skip("get", () => {});
  it.skip("get with env and headers", () => {});
  it.skip("post", () => {});
  it.skip("patch", () => {});
  it.skip("put", () => {});
  it.skip("head", () => {});
  it.skip("xml http request get", () => {});
  it.skip("xml http request post", () => {});
  it.skip("xml http request patch", () => {});
  it.skip("xml http request put", () => {});
  it.skip("xml http request delete", () => {});
  it.skip("xml http request head", () => {});
});

describe("IntegrationTestTest", () => {
  it.skip("opens new session", () => {});
  it.skip("child session assertions bubble up to root", () => {});
  it.skip("does not prevent method missing passing up to ancestors", () => {});
});

describe("RackLintIntegrationTest", () => {
  it.skip("integration test follows rack SPEC", () => {});
});

describe("IntegrationTestUsesCorrectClass", () => {
  it.skip("integration methods called", () => {});
});

describe("IntegrationProcessTest", () => {
  it.skip("get", () => {});
  it.skip("get xml rss atom", () => {});
  it.skip("post", () => {});
  it.skip("response cookies are added to the cookie jar for the next request", () => {});
  it.skip("cookie persist to next request", () => {});
  it.skip("cookie persist to next request on another domain", () => {});
  it.skip("redirect", () => {});
  it.skip("307 redirect uses the same http verb", () => {});
  it.skip("308 redirect uses the same http verb", () => {});
  it.skip("redirect reset html document", () => {});
  it.skip("redirect with arguments", () => {});
  it.skip("xml http request get", () => {});
  it.skip("request with bad format", () => {});
  it.skip("creation of multiple integration sessions", () => {});
  it.skip("get with query string", () => {});
  it.skip("get with parameters", () => {});
  it.skip("post then get with parameters do not leak across requests", () => {});
  it.skip("head", () => {});
  it.skip("generate url with controller", () => {});
  it.skip("port via host!", () => {});
  it.skip("port via process", () => {});
  it.skip("https and port via host and https!", () => {});
  it.skip("https and port via process", () => {});
  it.skip("respect removal of default headers by a controller action", () => {});
  it.skip("accept not overridden when xhr true", () => {});
  it.skip("setting vary header when request is xhr with accept header", () => {});
  it.skip("not setting vary header when format is provided", () => {});
  it.skip("not setting vary header when it has already been set", () => {});
  it.skip("not setting vary header when ignore accept header is set", () => {});
});

describe("MetalIntegrationTest", () => {
  it.skip("successful get", () => {});
  it.skip("failed get", () => {});
  it.skip("generate url without controller", () => {});
  it.skip("pass headers", () => {});
  it.skip("pass headers and env", () => {});
  it.skip("pass env", () => {});
  it.skip("ignores common ports in host", () => {});
  it.skip("keeps uncommon ports in host", () => {});
});

describe("ApplicationIntegrationTest", () => {
  it.skip("includes route helpers", () => {});
  it.skip("includes mounted helpers", () => {});
  it.skip("path after cascade pass", () => {});
  it.skip("route helpers after controller access", () => {});
  it.skip("route helpers after metal controller access", () => {});
  it.skip("missing route helper before controller access", () => {});
  it.skip("missing route helper after controller access", () => {});
  it.skip("process do not modify the env passed as argument", () => {});
});

describe("EnvironmentFilterIntegrationTest", () => {
  it.skip("filters rack request form vars", () => {});
});

describe("ControllerWithHeadersMethodIntegrationTest", () => {
  it.skip("doesn't call controller's headers method", () => {});
});

describe("UrlOptionsIntegrationTest", () => {
  it.skip("session uses default URL options from routes", () => {});
  it.skip("current host overrides default URL options from routes", () => {});
  it.skip("controller can override default URL options from request", () => {});
  it.skip("can override default url options", () => {});
  it.skip("current request path parameters are recalled", () => {});
});

describe("HeadWithStatusActionIntegrationTest", () => {
  it.skip("get /foo/status with head result does not cause stack overflow error", () => {});
});

describe("IntegrationWithRoutingTest", () => {
  it.skip("with routing resets session", () => {});
});

describe("IntegrationRequestsWithoutSetup", () => {
  it.skip("request", () => {});
});

describe("IntegrationRequestsWithSessionSetup", () => {
  it.skip("cookies set in setup are persisted through the session", () => {});
});

describe("IntegrationRequestEncodersTest", () => {
  it.skip("standard json encoding works", () => {});
  it.skip("encoding as json", () => {});
  it.skip("doesnt mangle request path", () => {});
  it.skip("encoding as without mime registration", () => {});
  it.skip("registering custom encoder", () => {});
  it.skip("registering custom encoder including parameters", () => {});
  it.skip("parsed body without as option", () => {});
  it.skip("get parameters with as option", () => {});
  it.skip("get request with json uses method override and sends a post request", () => {});
  it.skip("get request with json excludes null query string", () => {});
});

describe("IntegrationFileUploadTest", () => {
  describe("IntegrationController", () => {
    it.skip("file upload", () => {});
  });

  it.skip("fixture file upload", () => {});
});

describe("PageDumpIntegrationTest", () => {
  it.skip("save_and_open_page saves a copy of the page and call to Launchy", () => {});
  it.skip("prints a warning to install launchy if it can't be loaded", () => {});
  it.skip("raises when called after a redirect", () => {});
});
