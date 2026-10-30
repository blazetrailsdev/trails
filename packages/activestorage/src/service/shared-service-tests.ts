import { afterEach, beforeEach, expect, it } from "vitest";
import { base58, TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { RouteSet } from "@blazetrails/actionpack";
import { Digest, OpenSSL, Range, StringIO } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Current } from "../current.js";
import { FileNotFoundError, IntegrityError } from "../errors.js";
import { Filename } from "../filename.js";
import type { DiskService } from "./disk-service.js";

export const FIXTURE_DATA = Uint8Array.from(
  "89504e470d0a1a0a0000000d4948445200000010000000100103000000253d6d2200000006504c5445000000ffffffa5d99fdd0000003349444154789c63f8ff9fe1ff5f86ff9f190eb033dc3fcc707f32c3cdcd0c378d19ee1483d0bdcf0cf78152cc0c0fc0e8ff7f0051861728ce5d9b500000000049454e44ae426082"
    .match(/../g)!
    .map((byte) => parseInt(byte, 16)),
);

const routes = new RouteSet();
routes.draw(function () {
  this.scope("/rails/active_storage", function () {
    this.get("/disk/:encoded_key/*filename", {
      to: "active_storage/disk#show",
      as: "rails_disk_service",
    });
    this.put("/disk/:encoded_token", {
      to: "active_storage/disk#update",
      as: "update_rails_disk_service",
    });
  });
});

export function SharedServiceTests(SERVICE: DiskService): {
  service: DiskService;
  key: string;
  routes: RouteSet;
} {
  const ctx = { service: SERVICE, key: "", routes };

  beforeEach(async () => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    TopLevel.Trails ??= { application: { routes: () => routes } } as never;
    Current.urlOptions = {
      protocol: "https://",
      host: "example.com",
      port: null,
    };
    ctx.key = base58(24);
    ctx.service = SERVICE;
    await ctx.service.upload(ctx.key, new StringIO(FIXTURE_DATA));
  });

  afterEach(async () => {
    await ctx.service.delete(ctx.key);
  });

  const encode = (data: string) => new TextEncoder().encode(data);

  it("uploading with integrity", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
      });

      expect(await ctx.service.download(key)).toEqual(encode(data));
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("uploading without integrity", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await expect(
        ctx.service.upload(key, new StringIO(data), {
          checksum: OpenSSL.Digest.MD5.base64digest("bad data"),
        }),
      ).rejects.toThrow(IntegrityError);

      expect(await ctx.service.isExist(key)).toBe(false);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("uploading with integrity and multiple keys", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        filename: "racecar.jpg",
        contentType: "image/jpeg",
      });

      expect(await ctx.service.download(key)).toEqual(encode(data));
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("downloading", async () => {
    expect(await ctx.service.download(ctx.key)).toEqual(FIXTURE_DATA);
  });

  it("downloading a nonexistent file", async () => {
    await expect(ctx.service.download(base58(24))).rejects.toThrow(FileNotFoundError);
  });

  it("downloading in chunks", async () => {
    const key = base58(24);
    const expectedChunks = ["a".repeat(5 * 1024 * 1024), "b"];
    const actualChunks: string[] = [];

    try {
      await ctx.service.upload(key, new StringIO(expectedChunks.join("")));

      await ctx.service.download(key, (chunk) => {
        actualChunks.push(new TextDecoder().decode(chunk));
      });

      expect(actualChunks, "Downloaded chunks did not match uploaded data").toEqual(expectedChunks);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("downloading a nonexistent file in chunks", async () => {
    await expect(ctx.service.download(base58(24), () => {})).rejects.toThrow(FileNotFoundError);
  });

  it("downloading partially", async () => {
    expect(await ctx.service.downloadChunk(ctx.key, new Range(19, 21))).toEqual(
      Uint8Array.of(0x10, 0, 0),
    );
    expect(await ctx.service.downloadChunk(ctx.key, new Range(19, 22, true))).toEqual(
      Uint8Array.of(0x10, 0, 0),
    );
  });

  it("partially downloading a nonexistent file", async () => {
    await expect(ctx.service.downloadChunk(base58(24), new Range(19, 21))).rejects.toThrow(
      FileNotFoundError,
    );
  });

  it("existing", async () => {
    expect(await ctx.service.isExist(ctx.key)).toBe(true);
    expect(await ctx.service.isExist(ctx.key + "nonsense")).toBe(false);
  });

  it("deleting", async () => {
    await ctx.service.delete(ctx.key);
    expect(await ctx.service.isExist(ctx.key)).toBe(false);
  });

  it("deleting nonexistent key", async () => {
    await expect(ctx.service.delete(base58(24))).resolves.toBeUndefined();
  });

  it("deleting by prefix", async () => {
    const key = base58(24);
    try {
      await ctx.service.upload(`${key}/a/a/a`, new StringIO(FIXTURE_DATA));
      await ctx.service.upload(`${key}/a/a/b`, new StringIO(FIXTURE_DATA));
      await ctx.service.upload(`${key}/a/b/a`, new StringIO(FIXTURE_DATA));

      await ctx.service.deletePrefixed(`${key}/a/a/`);
      expect(await ctx.service.isExist(`${key}/a/a/a`)).toBe(false);
      expect(await ctx.service.isExist(`${key}/a/a/b`)).toBe(false);
      expect(await ctx.service.isExist(`${key}/a/b/a`)).toBe(true);
    } finally {
      await ctx.service.delete(`${key}/a/a/a`);
      await ctx.service.delete(`${key}/a/a/b`);
      await ctx.service.delete(`${key}/a/b/a`);
    }
  });

  it("compose", async () => {
    const keys = Array.from({ length: 3 }, () => base58(24));
    const data = ["To", "get", "her"];
    for (const [i, key] of keys.entries()) {
      await ctx.service.upload(key, new StringIO(data[i]), {
        checksum: Digest.MD5.base64digest(data[i]),
        disposition: "attachment",
        filename: new Filename("test.html"),
        contentType: "text/html",
      });
    }
    const destinationKey = base58(24);
    await ctx.service.compose(keys, destinationKey);

    expect(await ctx.service.download(destinationKey)).toEqual(encode("Together"));
  });

  return ctx;
}
