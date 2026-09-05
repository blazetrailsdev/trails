import { it, expect } from "vitest";
import { getZlib } from "@blazetrails/ruby-compat";
import { Deflater, GzipStream } from "./deflater.js";

const app = async () => [200, {}, ["hi"]] as [number, Record<string, any>, any];

it("honors an explicit sync: null as falsy instead of defaulting to true", () => {
  expect((new Deflater(app, { sync: null }) as any).sync).toBeNull();
  expect((new Deflater(app, {}) as any).sync).toBe(true);
  expect((new Deflater(app, { sync: false }) as any).sync).toBe(false);
});

it("emits decompressible gzip for a multi-chunk body", async () => {
  const body = ["chunk1", "chunk2", "", "chunk3"];
  const deflater = new Deflater(
    async () => [200, { "content-type": "text/plain" }, body] as [number, Record<string, any>, any],
  );

  const [, headers, out] = await deflater.call({ HTTP_ACCEPT_ENCODING: "gzip" });

  expect(headers["content-encoding"]).toBe("gzip");
  expect(headers["content-length"]).toBeUndefined();
  const chunks: Uint8Array[] = [];
  await (out as GzipStream).each((data) => chunks.push(data));
  expect(getZlib().gunzip(Buffer.concat(chunks)).toString()).toBe("chunk1chunk2chunk3");
});

it("writes the mtime into the gzip header, as Zlib::GzipWriter#mtime= does", async () => {
  const written: Uint8Array[] = [];
  const mtime = 1_700_000_000;
  await new GzipStream(["hello"], mtime, true).each((data) => written.push(data));

  const compressed = Buffer.concat(written);
  expect(compressed.readUInt32LE(4)).toBe(mtime);
  expect(getZlib().gunzip(compressed).toString()).toBe("hello");
});
