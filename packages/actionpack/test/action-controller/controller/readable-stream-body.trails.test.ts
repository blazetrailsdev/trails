import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HttpRequest, HttpResponse } from "@blazetrails/ruby-compat";
import { Handler } from "@blazetrails/rackup";
import "../../support/abstract-unit.js";
import { Base } from "../../../lib/action-controller/base.js";
import { TestCase } from "../../../lib/action-controller/test-case.js";
import { Response } from "../../../lib/action-dispatch/http/response.js";

await Handler.get("node");

class RelayController extends Base {
  async relay() {
    this.response.contentType = "application/octet-stream";
    await this.setResponseBody(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0x68, 0x69]));
          controller.enqueue(new TextEncoder().encode(" caf\u00e9"));
          controller.close();
        },
      }),
    );
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

  it("is cancelled by the rack body's close while a read is parked", async () => {
    let cancelled = false;
    const res = await Response.new();
    await res.setBody(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    const [, , body] = res.toA() as [
      number,
      unknown,
      AsyncIterable<unknown> & { toAry(): unknown; close(): unknown },
    ];
    expect(Array.isArray(body.toAry())).toBe(false);
    const chunks = body[Symbol.asyncIterator]();
    expect((await chunks.next()).value).toEqual(new Uint8Array([1]));
    const parked = chunks.next();
    await body.close();
    expect((await parked).done).toBe(true);
    expect(cancelled).toBe(true);
  });
});

describe("a ReadableStream response body served by Rackup::Handler::Node", () => {
  it("cancels a source stalled after its first chunk when the client disconnects", async () => {
    let cancelled = false;
    const app = async () => {
      const res = await Response.new();
      await res.setBody(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
      return res.toA();
    };
    const listeners: Record<string, (() => void)[]> = {};
    const written: unknown[] = [];
    const res = {
      writeHead() {},
      write(chunk: unknown) {
        written.push(chunk);
        return true;
      },
      end() {},
      on(event: string, listener: () => void) {
        (listeners[event] ??= []).push(listener);
      },
      removeListener() {},
    };
    const req = {
      method: "GET",
      url: "/",
      httpVersion: "1.1",
      headers: { host: "localhost:3000" },
      socket: { remoteAddress: "127.0.0.1" },
      on(event: string, listener: () => void) {
        if (event === "end") setTimeout(listener, 0);
      },
      destroy() {},
    };
    const serving = new Handler.Node(app).service(
      req as unknown as HttpRequest,
      res as unknown as HttpResponse,
    );
    await vi.waitFor(() => expect(written).toHaveLength(1));
    for (const listener of listeners["close"] ?? []) listener();
    await serving;
    expect(cancelled).toBe(true);
  });
});
