import { beforeEach, describe, it } from "vitest";
import { Concurrent, Thread } from "@blazetrails/ruby-compat";
import {
  assert,
  assertEqual,
  assertKindOf,
  assertNil,
  assertNotEqual,
} from "@blazetrails/activesupport";
import { Response as LiveResponse } from "../../action-controller/metal/live.js";
import { Request } from "../http/request.js";
import { RackBody } from "../http/response.js";

describe("ActionController", () => {
  describe("Live", () => {
    describe("ResponseTest", () => {
      let response: LiveResponse;

      beforeEach(() => {
        response = new LiveResponse();
        response.request = Request.empty();
      });

      it("header merge", () => {
        const headers = response.headers.merge({ Foo: "Bar" });
        assertKindOf(LiveResponse.Headers, headers);
        assertNotEqual(headers, response.headers);
      });

      it("initialize with default headers", () => {
        const r = class extends LiveResponse {
          static override get defaultHeaders(): Record<string, string> {
            return { omg: "g" };
          }
        };

        const headers = r.create().headers;
        assertKindOf(LiveResponse.Headers, headers);
        assertEqual("g", headers.get("omg"));
      });

      it("parallel", async () => {
        const latch = new Concurrent.CountDownLatch();

        const t = new Thread(async () => {
          response.stream.write("foo");
          await latch.wait();
          response.stream.close();
        });

        await response.awaitCommit();
        for await (const part of new RackBody(response)) {
          assertEqual("foo", part);
          latch.countDown();
        }
        assert(await t.join());
      });

      it("setting body populates buffer", () => {
        response.body = "omg";
        response.close();
        assertEqual(["omg"], response.bodyParts());
      });

      it("cache control is set by default", () => {
        response.stream.write("omg");
        assertEqual("no-cache", response.headers.get("Cache-Control"));
      });

      it("cache control is set manually", () => {
        response.setHeader("Cache-Control", "public");
        response.stream.write("omg");
        assertEqual("public", response.headers.get("Cache-Control"));
      });

      it("cache control no store default standalone", () => {
        response.setHeader("Cache-Control", "no-store");
        response.stream.write("omg");
        assertEqual("no-store", response.headers.get("Cache-Control"));
      });

      it("cache control no store is respected", () => {
        response.setHeader("Cache-Control", "public, no-store");
        response.stream.write("omg");
        assertEqual("no-store", response.headers.get("Cache-Control"));
      });

      it("cache control no store private", () => {
        response.setHeader("Cache-Control", "private, no-store");
        response.stream.write("omg");
        assertEqual("private, no-store", response.headers.get("Cache-Control"));
      });

      it("content length is removed", () => {
        response.headers.set("Content-Length", "1234");
        response.stream.write("omg");
        assertNil(response.headers.get("Content-Length"));
      });
    });
  });
});
