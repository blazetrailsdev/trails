import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Headers } from "../lib/headers.js";
import { Response } from "../lib/response.js";

describe("Rack::Cache::Response", () => {
  let now: Time | null;
  let oneHourAgo: Time | null;
  let oneHourLater: Time;
  let res: Response | null;

  beforeEach(() => {
    now = Time.httpdate(Time.now().httpdate());
    oneHourAgo = Time.httpdate((Time.now().minus(60 ** 2) as Time).httpdate());
    oneHourLater = Time.httpdate(
      Time.now()
        .plus(60 ** 2)
        .httpdate(),
    );
    res = new Response(200, { date: now.httpdate() }, []);
  });

  afterEach(() => {
    now = res = oneHourAgo = null;
  });

  it("marks Rack tuples with string typed statuses as cacheable", () => {
    res = new Response("200", { date: now!.httpdate() }, []);
    res.headers.set("expires", oneHourLater.httpdate());
    expect(res.isCacheable()).toBeTruthy();
  });

  it("responds to #to_a with a Rack response tuple", () => {
    expect(rbObjRespondTo(res, "toA")).toBeTruthy();
    expect(res!.toA()).toEqual([200, Headers({ date: now!.httpdate() }), []]);
  });

  describe("#cache_control", () => {
    it("handles multiple name=value pairs", () => {
      res!.headers.set("cache-control", "max-age=600, max-stale=300, min-fresh=570");
      expect(res!.cacheControl.get("max-age")).toBe("600");
      expect(res!.cacheControl.get("max-stale")).toBe("300");
      expect(res!.cacheControl.get("min-fresh")).toBe("570");
    });
    it("removes the header when given an empty hash", () => {
      res!.headers.set("cache-control", "max-age=600, must-revalidate");
      expect(res!.cacheControl.get("max-age")).toBe("600");
      res!.cacheControl = {};
      expect(res!.headers).not.toInclude("cache-control");
    });
  });

  describe("#validateable?", () => {
    it("is true when last-modified header present", () => {
      res = new Response(200, { "last-modified": oneHourAgo!.httpdate() }, []);
      expect(res.isValidateable()).toBeTruthy();
    });
    it("is true when etag header present", () => {
      res = new Response(200, { etag: '"12345"' }, []);
      expect(res.isValidateable()).toBeTruthy();
    });
    it("is false when no validator is present", () => {
      res = new Response(200, {}, []);
      expect(res.isValidateable()).toBeFalsy();
    });
  });

  describe("#date", () => {
    it("uses the Date header if present and parseable", () => {
      res = new Response(200, { date: oneHourAgo!.httpdate() }, []);
      expect(res.date.equals(oneHourAgo)).toBe(true);
    });
    it("returns the current time if present but not parseable", () => {
      res = new Response(200, { date: "Jun, 30 Mon 2014 20:10:46 GMT" }, []);
      expect(res.date.toI()).toBeWithinDelta(Time.now().toI(), 1);
    });
    it("uses the current time when no Date header present", () => {
      res = new Response(200, {}, []);
      expect(res.date.toI()).toBeWithinDelta(Time.now().toI(), 1);
    });
    it("returns the correct date when the header is modified directly", () => {
      res = new Response(200, { date: oneHourAgo!.httpdate() }, []);
      expect(res.date.equals(oneHourAgo)).toBe(true);
      res.headers.set("date", now!.httpdate());
      expect(res.date.equals(now)).toBe(true);
    });
  });

  describe("#max_age", () => {
    it("uses r-maxage cache control directive when present", () => {
      res!.headers.set("cache-control", "s-maxage=600, max-age=0, r-maxage=100");
      expect(res!.maxAge).toBe(100);
    });
    it("uses s-maxage cache control when no r-maxage directive present", () => {
      res!.headers.set("cache-control", "s-maxage=600, max-age=0");
      expect(res!.maxAge).toBe(600);
    });
    it("falls back to max-age when no r/s-maxage directive present", () => {
      res!.headers.set("cache-control", "max-age=600");
      expect(res!.maxAge).toBe(600);
    });
    it("falls back to expires when no max-age or r/s-maxage directive present", () => {
      res!.headers.set("cache-control", "must-revalidate");
      res!.headers.set("expires", oneHourLater.httpdate());
      expect(res!.maxAge).toBe(60 ** 2);
    });
    it("gives a #max_age of nil when no freshness information available", () => {
      expect(res!.maxAge).toBeNull();
    });
  });

  describe("#private=", () => {
    it("adds the private cache-control directive when set true", () => {
      res!.headers.set("cache-control", "max-age=100");
      res!.private = true;
      expect(res!.headers.get("cache-control")!.split(", ").sort()).toEqual([
        "max-age=100",
        "private",
      ]);
    });
    it("removes the public cache-control directive", () => {
      res!.headers.set("cache-control", "public, max-age=100");
      res!.private = true;
      expect(res!.headers.get("cache-control")!.split(", ").sort()).toEqual([
        "max-age=100",
        "private",
      ]);
    });
  });

  describe("#expire!", () => {
    it("sets the Age to be equal to the max-age", () => {
      res!.headers.set("cache-control", "max-age=100");
      res!.expireBang();
      expect(res!.headers.get("age")).toBe("100");
    });
    it("sets the Age to be equal to the r-maxage when the three max-age and r/s-maxage present", () => {
      res!.headers.set("cache-control", "max-age=100, s-maxage=500, r-maxage=900");
      res!.expireBang();
      expect(res!.headers.get("age")).toBe("900");
    });
    it("sets the Age to be equal to the s-maxage when both max-age and s-maxage present", () => {
      res!.headers.set("cache-control", "max-age=100, s-maxage=500");
      res!.expireBang();
      expect(res!.headers.get("age")).toBe("500");
    });
    it("does nothing when the response is already stale/expired", () => {
      res!.headers.set("cache-control", "max-age=5, s-maxage=500");
      res!.headers.set("age", "1000");
      res!.expireBang();
      expect(res!.headers.get("age")).toBe("1000");
    });
    it("does nothing when the response does not include freshness information", () => {
      res!.expireBang();
      expect(res!.headers).not.toInclude("age");
    });
  });

  describe("#ttl", () => {
    it("is nil when no expires or cache-control headers present", () => {
      expect(res!.ttl).toBeNull();
    });
    it("uses the expires header when no max-age is present", () => {
      res!.headers.set("expires", res!.now.plus(60 ** 2).httpdate());
      expect(res!.ttl!).toBeWithinDelta(60 ** 2, 1);
    });
    it("returns negative values when expires is in part", () => {
      expect(res!.ttl).toBeNull();
      res!.headers.set("expires", oneHourAgo!.httpdate());
      expect(res!.ttl).toBeLessThan(0);
    });
    it("uses the cache-control max-age value when present", () => {
      res!.headers.set("cache-control", "max-age=60");
      expect(res!.ttl!).toBeWithinDelta(60, 1);
    });
  });

  describe("#vary", () => {
    it("is nil when no Vary header is present", () => {
      expect(res!.vary).toBeNull();
    });
    it("returns the literal value of the Vary header", () => {
      res!.headers.set("vary", "Foo Bar Baz");
      expect(res!.vary).toBe("Foo Bar Baz");
    });
    it("can be checked for existence using the #vary? method", () => {
      expect(rbObjRespondTo(res, "isVary")).toBeTruthy();
      expect(res!.isVary()).toBeFalsy();
      res!.headers.set("vary", "*");
      expect(res!.isVary()).toBeTruthy();
    });
  });

  describe("#vary_header_names", () => {
    it("returns an empty Array when no Vary header is present", () => {
      expect(res!.varyHeaderNames.length === 0).toBeTruthy();
    });
    it("parses a single header name value", () => {
      res!.headers.set("vary", "accept-language");
      expect(res!.varyHeaderNames).toEqual(["accept-language"]);
    });
    it("parses multiple header name values separated by spaces", () => {
      res!.headers.set("vary", "accept-language user-agent    x-foo");
      expect(res!.varyHeaderNames).toEqual(["accept-language", "user-agent", "x-foo"]);
    });

    it("parses multiple header name values separated by commas", () => {
      res!.headers.set("vary", "accept-language,user-agent,    x-foo");
      expect(res!.varyHeaderNames).toEqual(["accept-language", "user-agent", "x-foo"]);
    });
  });

  describe("#expires", () => {
    it("returns nil if there is no expires header", () => {
      res!.headers.delete("expires");
      expect(res!.expires).toBeNull();
    });

    it("returns a Time if the expires header is parseable", () => {
      res!.headers.set("expires", "Mon, 30 Jun 2014 20:10:46 GMT");
      expect(res!.expires!.equals(Time.at(1404159046))).toBe(true);
    });

    it("returns nil if the expires header is not parseable", () => {
      res!.headers.set("expires", "Jun, 30 Mon 2014 20:10:46 GMT");
      expect(res!.expires).toBeNull();
    });
  });
});
