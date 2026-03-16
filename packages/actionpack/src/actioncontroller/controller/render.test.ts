import { describe, it } from "vitest";

describe("ExpiresInRenderTest", () => {
  it.skip("dynamic render with file", () => {});
  it.skip("dynamic render with absolute path", () => {});
  it.skip("dynamic render", () => {});
  it.skip("permitted dynamic render file hash", () => {});
  it.skip("dynamic render file hash", () => {});
  it.skip("expires in header", () => {});
  it.skip("expires in header with public", () => {});
  it.skip("expires in header with must revalidate", () => {});
  it.skip("expires in header with public and must revalidate", () => {});
  it.skip("expires in header with stale while revalidate", () => {});
  it.skip("expires in header with stale if error", () => {});
  it.skip("expires in header with immutable", () => {});
  it.skip("expires in header with additional headers", () => {});
  it.skip("expires in old syntax", () => {});
  it.skip("expires now", () => {});
  it.skip("expires now with cache control headers", () => {});
  it.skip("expires now with conflicting cache control headers", () => {});
  it.skip("no expires now with conflicting cache control headers", () => {});
  it.skip("no expires now with public", () => {});
  it.skip("date header when expires in", () => {});
  it.skip("cache control default header with extras partially overridden by expires in", () => {});
  it.skip("cache control no store overridden by expires in", () => {});
  it.skip("cache control no store overridden by expires now", () => {});
});

describe("LastModifiedRenderTest", () => {
  it.skip("responds with last modified", () => {});
  it.skip("request not modified", () => {});
  it.skip("request not modified but etag differs", () => {});
  it.skip("request modified", () => {});
  it.skip("responds with custom cache control headers", () => {});
  it.skip("responds with last modified with record", () => {});
  it.skip("request not modified with record", () => {});
  it.skip("request not modified but etag differs with record", () => {});
  it.skip("request modified with record", () => {});
  it.skip("responds with last modified with array of records", () => {});
  it.skip("request not modified with array of records", () => {});
  it.skip("request not modified but etag differs with array of records", () => {});
  it.skip("request modified with array of records", () => {});
  it.skip("responds with last modified with collection of records", () => {});
  it.skip("request not modified with collection of records", () => {});
  it.skip("request not modified but etag differs with collection of records", () => {});
  it.skip("request modified with collection of records", () => {});
  it.skip("request with bang gets last modified", () => {});
  it.skip("request with bang obeys last modified", () => {});
  it.skip("last modified works with less than too", () => {});
  it.skip("last modified with custom cache control headers", () => {});
});

describe("EtagRenderTest", () => {
  it.skip("strong etag", () => {});
  it.skip("multiple etags", () => {});
  it.skip("array", () => {});
  it.skip("etag reflects template digest", () => {});
  it.skip("etag reflects implicit template digest", () => {});
});

describe("NamespacedEtagRenderTest", () => {
  it.skip("etag reflects template digest", () => {});
});

describe("InheritedEtagRenderTest", () => {
  it.skip("etag reflects template digest", () => {});
});

describe("MetalRenderTest", () => {
  it.skip("access to logger in view", () => {});
});

describe("ActionControllerRenderTest", () => {
  it.skip("direct render to string with body", () => {});
});

describe("ActionControllerBaseRenderTest", () => {
  it.skip("direct render to string", () => {});
});

describe("ImplicitRenderTest", () => {
  it.skip("implicit no content response as browser", () => {});
  it.skip("implicit no content response as xhr", () => {});
  it.skip("implicit success response with right format", () => {});
  it.skip("implicit unknown format response", () => {});
});

describe("HeadRenderTest", () => {
  it.skip("head created", () => {});
  it.skip("head created with application json content type", () => {});
  it.skip("head ok with image png content type", () => {});
  it.skip("head respect string content type", () => {});
  it.skip("head with location header", () => {});
  it.skip("head with location object", () => {});
  it.skip("head with custom header", () => {});
  it.skip("head with www authenticate header", () => {});
  it.skip("head with symbolic status", () => {});
  it.skip("head with integer status", () => {});
  it.skip("head with no content", () => {});
  it.skip("head with string status", () => {});
  it.skip("head with status code first", () => {});
  it.skip("head returns truthy value", () => {});
  it.skip("head default content type", () => {});
});

describe("LiveTestController", () => {
  it.skip("action", () => {});
});

describe("LiveHeadRenderTest", () => {
  it.skip("live head ok", () => {});
});

describe("HttpCacheForeverTest", () => {
  it.skip("cache with public", () => {});
  it.skip("cache with private", () => {});
  it.skip("cache response code with if modified since", () => {});
  it.skip("cache response code with etag", () => {});
});

describe("HttpCacheNoStoreTest", () => {
  it.skip("standalone no store call", () => {});
  it.skip("no store overridden by expires in", () => {});
  it.skip("expires in overridden by no store", () => {});
  it.skip("no store overridden by fresh when", () => {});
  it.skip("fresh when overridden by no store", () => {});
  it.skip("expires now overridden by no store", () => {});
  it.skip("no store overridden by expires now", () => {});
  it.skip("cache control no cache header can be overridden by no store", () => {});
  it.skip("cache control public with expiration header can be overridden by no store", () => {});
});
