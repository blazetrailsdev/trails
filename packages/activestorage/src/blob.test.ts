import { beforeEach, describe, expect, it } from "vitest";
import { base36 } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { RecordNotSaved } from "@blazetrails/activerecord";
import { ArgumentError, OpenSSL } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Blob } from "./blob.js";
import { buildBlobAfterUnfurling, createBlob } from "./test-helpers/test-helper.js";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("ActiveStorage::BlobTest", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("create_and_upload sets byte size and checksum", async () => {
    const data = "Hello world!";
    const blob = await createBlob({ data: data });

    expect(decode(await blob.download())).toBe(data);
    expect(blob.byte_size).toBe(data.length);
    expect(blob.checksum).toBe(OpenSSL.Digest.MD5.base64digest(data));
  });

  it("create_and_upload prefers given content type over filename", async () => {
    const blob = await createBlob({ contentType: "specific/type", filename: "file.txt" });
    expect(blob.content_type).toBe("specific/type");
  });

  it("create_and_upload prefers filename over binary content type", async () => {
    const blob = await createBlob({
      contentType: "application/octet-stream",
      filename: "file.txt",
    });
    expect(blob.content_type).toBe("text/plain");
  });

  it("create_and_upload extracts content type from filename", async () => {
    const blob = await createBlob({ contentType: null, filename: "hello.txt" });
    expect(blob.content_type).toBe("text/plain");
  });

  it("create_and_upload generates a 28-character base36 key", async () => {
    expect((await createBlob()).key).toMatch(/^[a-z0-9]{28}$/);
  });

  it("create_and_upload accepts a custom key", async () => {
    const key = base36(28);
    const data = "Hello world!";
    const blob = await createBlob({ key: key, data: data });

    expect(blob.key).toBe(key);
    expect(decode(await blob.download())).toBe(data);
  });

  it("create_and_upload raises for non-rewindable io", async () => {
    await expect(
      Blob.createAndUploadBang({
        io: { read: () => null, size: () => 0 } as never,
        filename: "racecar.jpg",
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("build_after_unfurling generates a 28-character base36 key", () => {
    expect(buildBlobAfterUnfurling().key).toMatch(/^[a-z0-9]{28}$/);
  });

  it("compose", async () => {
    const blobs: Blob[] = [];
    for (let i = 0; i < 3; i++) {
      blobs.push(
        await createBlob({
          data: "123",
          filename: "numbers.txt",
          contentType: "text/plain",
          identify: false,
        }),
      );
    }
    const blob = await Blob.compose(blobs, { filename: "all_numbers.txt" });

    expect(decode(await blob.download())).toBe("123123123");
    expect(blob.content_type).toBe("text/plain");
    expect(blob.byte_size).toBe(blobs[0].byte_size! * blobs.length);
    expect(blob.composed).toBeTruthy();
    expect(blob.checksum).toBeNull();
  });

  it("compose with unpersisted blobs", async () => {
    const blobs: Blob[] = [];
    for (let i = 0; i < 3; i++) {
      blobs.push(
        (
          await createBlob({
            data: "123",
            filename: "numbers.txt",
            contentType: "text/plain",
            identify: false,
          })
        ).dup(),
      );
    }

    const error = await Blob.compose(blobs, { filename: "all_numbers.txt" }).catch((e) => e);
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect(error.message).toBe("All blobs must be persisted.");
  });

  it("compose with custom key", async () => {
    const blobs: Blob[] = [];
    for (let i = 0; i < 3; i++) {
      blobs.push(
        await createBlob({
          data: "123",
          filename: "numbers.txt",
          contentType: "text/plain",
          identify: false,
        }),
      );
    }
    const blob = await Blob.compose(blobs, { key: "custom_key", filename: "all_numbers.txt" });

    expect(blob.key).toBe("custom_key");
    expect(decode(await blob.download())).toBe("123123123");
  });

  it("text?", async () => {
    const blob = await createBlob({ data: "Hello world!" });
    expect(blob.isText()).toBe(true);
    expect(blob.isAudio()).toBe(false);
  });

  it("download yields chunks", async () => {
    const blob = await createBlob({ data: "a".repeat(Numeric.megabytes(5.0625)) });
    const chunks: Uint8Array[] = [];

    await blob.download((chunk) => {
      chunks.push(chunk);
    });

    expect(chunks.length).toBe(2);
    expect(decode(chunks[0])).toBe("a".repeat(Numeric.megabytes(5)));
    expect(decode(chunks[1])).toBe("a".repeat(Numeric.kilobytes(64)));
  });
});
