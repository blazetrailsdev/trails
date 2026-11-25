import { describe, it, expect } from "vitest";
import type { HttpRequest, HttpResponse } from "@blazetrails/ruby-compat/http-adapter";
import { IO } from "@blazetrails/ruby-compat";
import { Handler } from "@blazetrails/rackup";
import "../../support/abstract-unit.js";
import { FileBody, Response } from "../../../lib/action-dispatch/http/response.js";

await Handler.get("node");

const FIXTURES = new URL("../../fixtures/multipart", import.meta.url).pathname;

async function serve(
  path: string,
): Promise<{ headers: Record<string, string>; bytes: Uint8Array }> {
  const size = IO.binread(path).length;
  const app = async () => {
    const response = await Response.new();
    response.setHeader("content-length", String(size));
    await response.setBody(new FileBody(path));
    return response.toA();
  };
  const written: Uint8Array[] = [];
  let headers: Record<string, string> = {};
  const res = {
    writeHead(_status: number, h: Record<string, string>) {
      headers = h;
    },
    write(chunk: string | Uint8Array) {
      written.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      return true;
    },
    end() {},
    on() {},
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
  await new Handler.Node(app).service(
    req as unknown as HttpRequest,
    res as unknown as HttpResponse,
  );
  const bytes = new Uint8Array(written.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of written) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { headers, bytes };
}

describe("a FileBody served by Rackup::Handler::Node", () => {
  for (const name of ["bracketed_utf8_param", "ruby_on_rails.jpg"]) {
    it(`writes ${name} byte-identical, as many bytes as its content-length`, async () => {
      const path = `${FIXTURES}/${name}`;
      const { headers, bytes } = await serve(path);
      expect(bytes).toEqual(IO.binread(path));
      expect(Number(headers["content-length"])).toBe(bytes.length);
    });
  }
});
