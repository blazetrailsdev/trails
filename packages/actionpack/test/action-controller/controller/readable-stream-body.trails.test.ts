import { describe, it, expect, beforeEach } from "vitest";
import "../../support/abstract-unit.js";
import { Base } from "../../../lib/action-controller/base.js";
import { TestCase } from "../../../lib/action-controller/test-case.js";
import { Response } from "../../../lib/action-dispatch/http/response.js";

class RelayController extends Base {
  relay() {
    this.response.contentType = "application/octet-stream";
    this.responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x68, 0x69]));
        controller.enqueue(new TextEncoder().encode(" caf\u00e9"));
        controller.close();
      },
    });
  }
}

describe("a ReadableStream response body", () => {
  class RelayTest extends TestCase {
    declare controller: RelayController;
    override setup() {
      this.controller = new RelayController();
    }
  }

  let tc: RelayTest;

  beforeEach(async ({ task }) => {
    tc = new RelayTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("is read by ActionController::TestCase as a string", async () => {
    const response = await tc.get("relay");
    expect(response.body).toBe("hi café");
  });

  it("is streamed chunk by chunk through the rack body, and cancelled on an early return", async () => {
    let cancelled = false;
    const res = new Response();
    res.body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const [, , body] = res.toA() as [number, unknown, AsyncIterable<unknown>];
    expect(Array.isArray((body as { toAry(): unknown }).toAry())).toBe(false);
    for await (const chunk of body) {
      expect(chunk).toEqual(new Uint8Array([1]));
      break;
    }
    expect(cancelled).toBe(true);
  });
});
