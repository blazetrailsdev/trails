import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertCalledWith,
  assertChanges,
  assertNoDifference,
  assertRaises,
  base36,
  Duration,
  freezeTime,
  stub,
  travelBack,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { ContentDisposition } from "@blazetrails/actionpack";
import { RecordInvalid, RecordNotSaved, RecordNotUnique } from "@blazetrails/activerecord";
import { ArgumentError, Dir, File, IO, OpenSSL, Pathname } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Blob } from "./blob.js";
import { Current } from "./current.js";
import { IntegrityError } from "./errors.js";
import { Filename } from "./filename.js";
import { PurgeJob } from "./purge-job.js";
import { DiskService } from "./service/disk-service.js";
import {
  buildBlobAfterUnfurling,
  createBlob,
  createFileBlob,
  directlyUploadFileBlob,
  fileFixture,
  User,
  withService,
  withStrictLoadingByDefault,
  withoutVariantTracking,
} from "./test-helpers/test-helper.js";

// BLOCKED: activestorage-attachment-test-and-fixture-set-attached-arms
Object.assign(Blob.prototype, {
  isAnalyzed: () => false,
  analyzeLater: async () => {},
  isPreviewImageNeededBeforeProcessingVariants: () => false,
});

class BlobTest extends TestCase {
  purgeLater(): void {}
}

const binary = (bytes: unknown) => new TextDecoder("latin1").decode(bytes as Uint8Array);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function expectedUrlFor(
  blob: Blob,
  {
    disposition = "attachment",
    filename = null,
    contentType = null,
    serviceName = "local",
  }: {
    disposition?: string;
    filename?: Filename | null;
    contentType?: string | null;
    serviceName?: string;
  } = {},
): string {
  filename ??= blob.filename;
  contentType ??= blob.content_type;

  const keyParams = {
    key: blob.key,
    disposition: ContentDisposition.format({
      disposition: disposition,
      filename: filename.sanitized(),
    }),
    content_type: contentType,
    service_name: serviceName,
  };

  return `https://example.com/rails/active_storage/disk/${ActiveStorage.verifier.generate(keyParams, { expiresIn: Duration.minutes(5), purpose: "blob_key" })}/${filename}`;
}

describe("ActiveStorage::BlobTest", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  });

  afterEach(() => {
    Current.reset();
    travelBack();
  });

  it("unattached scope", async () => {
    const blobs = [
      await createBlob({ filename: "funky.jpg" }),
      await createBlob({ filename: "town.jpg" }),
    ];
    const unattachedIds = async () => (await Blob.unattached().toArray()).map((blob) => blob.id);

    await User.createBang({ name: "DHH", avatar: blobs[0] });
    expect(await unattachedIds()).toContain(blobs[1].id);
    expect(await unattachedIds()).not.toContain(blobs[0].id);

    await User.createBang({ name: "Jason", avatar: blobs[1] });
    expect(await unattachedIds()).not.toContain(blobs[1].id);
  });

  it("create_and_upload does not permit a conflicting blob key to overwrite an existing object", async () => {
    const data = "First file";
    const blob = await createBlob({ data: data });

    await assertRaises([RecordNotUnique], {}, async () => {
      await stub(
        Blob,
        "generateUniqueSecureToken",
        () => blob.key,
        undefined,
        async () => {
          await createBlob({ data: "This would overwrite" });
        },
      );
    });

    expect(decode(await blob.download())).toBe(data);
  });

  it("create_and_upload sets byte size and checksum", async () => {
    const data = "Hello world!";
    const blob = await createBlob({ data: data });

    expect(decode(await blob.download())).toBe(data);
    expect(blob.byte_size).toBe(data.length);
    expect(blob.checksum).toBe(OpenSSL.Digest.MD5.base64digest(data));
  });

  it("create_and_upload extracts content type from data", async () => {
    const blob = await createFileBlob({
      fixture: "racecar.jpg",
      contentType: "application/octet-stream",
      filename: "spoofed.txt",
    });
    expect(blob.content_type).toBe("image/jpeg");
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

  it("create_and_upload extracts content_type from io when missing and identify: false", async () => {
    const blob = await createFileBlob({
      fixture: "racecar.jpg",
      contentType: null,
      filename: "unknown",
      identify: false,
    });
    expect(blob.content_type).toBe("image/jpeg");
  });

  it("create_and_upload uses given content_type when identify: false", async () => {
    const blob = await createFileBlob({
      fixture: "racecar.jpg",
      contentType: "given/type",
      filename: "unknown",
      identify: false,
    });
    expect(blob.content_type).toBe("given/type");
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

  it("create_and_upload accepts a record for overrides", async () => {
    await createBlob({ record: new User() });
  });

  it("create_and_upload raises for non-rewindable io", async () => {
    await expect(
      Blob.createAndUploadBang({
        io: new Pathname(fileFixture("racecar.jpg")) as never,
        filename: "racecar.jpg",
      }),
    ).rejects.toThrow(ArgumentError);
  });

  // BLOCKED: activestorage-image-analyzers
  it.skip("record touched after analyze", async () => {
    const user = await User.createBang({
      name: "Nate",
      avatar: {
        contentType: "image/jpeg",
        filename: "racecar.jpg",
        io: File.open(fileFixture("racecar.jpg")),
      },
    });

    await assertChanges(
      async () => (await user.reload()).readAttribute("updated_at"),
      null,
      {},
      async () => {
        const blob = (await (await user.avatar.attachment)!.blob)!;
        await (blob as Blob & { analyze(): Promise<void> }).analyze();
      },
    );
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

  it("image?", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    expect(blob.isImage()).toBe(true);
    expect(blob.isAudio()).toBe(false);
  });

  it("video?", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });
    expect(blob.isVideo()).toBe(true);
    expect(blob.isAudio()).toBe(false);
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

  it("open with integrity", async () => {
    const blob = await createFileBlob({ filename: "racecar.jpg" });
    const fixture = await IO.binreadAsync(fileFixture("racecar.jpg"));
    await blob.open({}, (file) => {
      expect(file.isBinmode()).toBe(true);
      expect(file.pos).toBe(0);
      expect(File.basename(file.path()!).startsWith(`ActiveStorage-${blob.id}-`)).toBe(true);
      expect(file.path()!.endsWith(".jpg")).toBe(true);
      expect(binary(file.read())).toBe(binary(fixture));
    });
  });

  it("open without integrity", async () => {
    const blob = await createBlob({ data: "Hello, world!" });
    await blob.updateBang({ checksum: OpenSSL.Digest.MD5.base64digest("Goodbye, world!") });

    await expect(
      blob.open({}, () => {
        expect.fail("Expected integrity check to fail");
      }),
    ).rejects.toThrow(IntegrityError);
  });

  it("open in a custom tmpdir", async () => {
    const tmpdir = Dir.mktmpdir();
    const fixture = await IO.binreadAsync(fileFixture("racecar.jpg"));
    await (
      await createFileBlob({ filename: "racecar.jpg" })
    ).open({ tmpdir: tmpdir }, (file) => {
      expect(file.isBinmode()).toBe(true);
      expect(file.pos).toBe(0);
      expect(file.path()).toMatch(/\.jpg$/);
      expect(file.path()!.startsWith(tmpdir)).toBe(true);
      expect(binary(file.read())).toBe(binary(fixture));
    });
  });

  it("URLs expiring in 5 minutes", async () => {
    const blob = await createBlob();

    freezeTime();
    expect(blob.url()).toBe(expectedUrlFor(blob));
    expect(blob.url({ disposition: "attachment" })).toBe(
      expectedUrlFor(blob, { disposition: "attachment" }),
    );
  });

  it("URLs force content_type to binary and attachment as content disposition for content types served as binary", async () => {
    const blob = await createBlob({ contentType: "text/html" });
    const expected = { disposition: "attachment", contentType: "application/octet-stream" };

    freezeTime();
    expect(blob.url()).toBe(expectedUrlFor(blob, expected));
    expect(blob.url({ disposition: "inline" })).toBe(expectedUrlFor(blob, expected));
  });

  it("URLs force attachment as content disposition when the content type is not allowed inline", async () => {
    const blob = await createBlob({ contentType: "application/zip" });
    const expected = { disposition: "attachment", contentType: "application/zip" };

    freezeTime();
    expect(blob.url()).toBe(expectedUrlFor(blob, expected));
    expect(blob.url({ disposition: "inline" })).toBe(expectedUrlFor(blob, expected));
  });

  it("URLs allow for custom filename", async () => {
    const blob = await createBlob({ filename: "original.txt" });
    const newFilename = new Filename("new.txt");

    freezeTime();
    expect(blob.url()).toBe(expectedUrlFor(blob));
    expect(blob.url({ filename: newFilename })).toBe(
      expectedUrlFor(blob, { filename: newFilename }),
    );
    expect(blob.url({ filename: "new.txt" })).toBe(expectedUrlFor(blob, { filename: newFilename }));
    expect(blob.url({ filename: null })).toBe(expectedUrlFor(blob, { filename: blob.filename }));
  });

  it("URLs allow for custom options", async () => {
    const blob = await createBlob({ filename: "original.txt" });

    const kwargs = {
      expiresIn: ActiveStorage.serviceUrlsExpireIn,
      disposition: "attachment",
      contentType: blob.content_type,
      filename: blob.filename,
      thumbSize: "300x300",
      thumbMode: "crop",
    };
    assertCalledWith(blob.service, "url", [blob.key, kwargs], {}, () => {
      blob.url({ thumbSize: "300x300", thumbMode: "crop" });
    });
  });

  it("purge deletes file from external service", async () => {
    const blob = await createBlob();

    await blob.purge();
    expect(await Blob.service!.isExist(blob.key)).toBe(false);
  });

  // BLOCKED: activestorage-variation-and-variants
  it.skip("purge deletes variants from external service with the purge_later", async () => {
    const blob = await createFileBlob();
    const variant = await (
      blob as unknown as {
        variant(transformations: object): {
          processed(): Promise<{ image: { blob: Blob } }>;
        };
      }
    )
      .variant({ resizeToLimit: [100, null] })
      .processed();

    await blob.purge();
    const t = new BlobTest("purgeLater") as unknown as TestHelper;
    await t.assertEnqueuedWith({ job: PurgeJob, args: [variant.image.blob] });
  });

  it("purge does nothing when attachments exist", async () => {
    const blob = await createBlob();
    await User.createBang({ name: "DHH", avatar: blob });
    await assertNoDifference(
      () => Blob.count(),
      null,
      () => blob.purge(),
    );
    expect(await Blob.service!.isExist(blob.key)).toBe(true);
  });

  it("purge doesn't raise when blob is not persisted", async () => {
    const blob = buildBlobAfterUnfurling();
    await blob.purge();
    expect(blob.isDestroyed()).toBe(true);
  });

  // BLOCKED: activestorage-mirror-service-over-disk
  it.skip("uses service from blob when provided", async () => {
    await withService("mirror", async () => {
      const blob = await createBlob({ filename: "funky.jpg", serviceName: "local" });
      expect(blob.service).toBeInstanceOf(DiskService);
    });
  });

  it("doesn't create a valid blob if service setting is nil", async () => {
    await withService(null, async () => {
      await expect(createBlob({ filename: "funky.jpg" })).rejects.toThrow(RecordInvalid);
    });
  });

  it("invalidates record when provided service_name is invalid", async () => {
    const blob = await createBlob({ filename: "funky.jpg" });
    await blob.update({ service_name: "unknown" });

    expect(await blob.isValid()).toBe(false);
    expect(blob.errors.get("service_name")).toEqual(["is invalid"]);
  });

  it("updating the content_type updates service metadata", async () => {
    const blob = await directlyUploadFileBlob({
      filename: "racecar.jpg",
      contentType: "application/octet-stream",
    });

    await assertCalledWith(
      blob.service,
      "updateMetadata",
      [blob.key, { contentType: "image/jpeg", customMetadata: {} }],
      {},
      async () => {
        await blob.updateBang({ content_type: "image/jpeg" });
      },
    );
  });

  it("updating the metadata updates service metadata", async () => {
    const blob = await directlyUploadFileBlob({
      filename: "racecar.jpg",
      contentType: "application/octet-stream",
    });

    const expectedKwargs = {
      contentType: "application/octet-stream",
      disposition: "attachment",
      filename: blob.filename,
      customMetadata: { test: true },
    };

    await assertCalledWith(
      blob.service,
      "updateMetadata",
      [blob.key, expectedKwargs],
      {},
      async () => {
        await blob.updateBang({ metadata: { custom: { test: true } } });
      },
    );
  });

  it("scope_for_strict_loading adds includes only when track_variants and strict_loading_by_default", async () => {
    expect(Blob.scopeForStrictLoading().includesValues).toEqual([]);

    await withStrictLoadingByDefault(async () => {
      expect(Blob.scopeForStrictLoading().includesValues).not.toEqual([]);

      await withoutVariantTracking(() => {
        expect(Blob.scopeForStrictLoading().includesValues).toEqual([]);
      });
    });
  });
});
