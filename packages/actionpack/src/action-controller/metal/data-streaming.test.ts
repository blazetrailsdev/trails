import { describe, it, expect, beforeEach } from "vitest";
import { Headers } from "@blazetrails/rack";
import {
  sendFileHeadersBang,
  DEFAULT_SEND_FILE_TYPE,
  type SendFileHeadersHost,
} from "./data-streaming.js";

interface TestHost extends SendFileHeadersHost {
  headers: Headers;
}

function makeHost(): TestHost {
  return {
    contentType: null,
    response: { sendingFile: false },
    headers: new Headers(),
  };
}

describe("sendFileHeadersBang", () => {
  let host: TestHost;

  beforeEach(() => {
    host = makeHost();
  });

  it("defaults to application/octet-stream and attachment disposition", () => {
    sendFileHeadersBang.call(host, { filename: "data.bin" });
    expect(host.contentType).toBe(DEFAULT_SEND_FILE_TYPE);
    expect(host.response.sendingFile).toBe(true);
    expect(host.headers.get("Content-Disposition")).toMatch(/^attachment; filename="data\.bin"/);
    expect(host.headers.get("Content-Transfer-Encoding")).toBe("binary");
  });

  it("honors explicit string type", () => {
    sendFileHeadersBang.call(host, { type: "image/png", filename: "x.png" });
    expect(host.contentType).toBe("image/png");
  });

  it("resolves Mime symbol-like keys via MimeType.lookup", () => {
    sendFileHeadersBang.call(host, { type: "json" });
    expect(host.contentType).toBe("application/json");
  });

  it("raises on unknown Mime symbol", () => {
    expect(() => sendFileHeadersBang.call(host, { type: "nope" })).toThrow(/Unknown MIME type/);
  });

  it("guesses content type from filename when type omitted", () => {
    sendFileHeadersBang.call(host, { filename: "report.pdf" });
    expect(host.contentType).toBe("application/pdf");
  });

  it("falls back to default when filename extension is unknown", () => {
    sendFileHeadersBang.call(host, { filename: "blob.xyz" });
    expect(host.contentType).toBe(DEFAULT_SEND_FILE_TYPE);
  });

  it("emits both ASCII filename and RFC 5987 filename* when filename has non-ASCII chars", () => {
    sendFileHeadersBang.call(host, { filename: "résumé.pdf" });
    const cd = host.headers.get("Content-Disposition");
    expect(cd).toMatch(/filename="/);
    expect(cd).toMatch(/filename\*=UTF-8''/);
  });

  it("supports inline disposition", () => {
    sendFileHeadersBang.call(host, {
      type: "text/html",
      filename: "p.html",
      disposition: "inline",
    });
    expect(host.headers.get("Content-Disposition")).toMatch(/^inline;/);
  });

  it("omits Content-Disposition when disposition is falsy", () => {
    sendFileHeadersBang.call(host, { type: "text/plain", disposition: false });
    expect(host.headers.get("Content-Disposition")).toBeUndefined();
    expect(host.headers.get("Content-Transfer-Encoding")).toBe("binary");
  });

  it("omits Content-Disposition when disposition is null", () => {
    sendFileHeadersBang.call(host, { type: "text/plain", disposition: null });
    expect(host.headers.get("Content-Disposition")).toBeUndefined();
  });

  it("uses bare disposition when filename absent", () => {
    sendFileHeadersBang.call(host, { type: "text/plain" });
    expect(host.headers.get("Content-Disposition")).toBe("attachment");
  });

  it("raises when explicit type is null", () => {
    expect(() => sendFileHeadersBang.call(host, { type: null })).toThrow(/:type option required/);
  });

  it("marks response.sendingFile = true", () => {
    sendFileHeadersBang.call(host, { type: "application/zip" });
    expect(host.response.sendingFile).toBe(true);
  });
});
