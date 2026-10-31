import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base58, freezeTime, minutes, travelBack } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { Dir, OpenSSL, StringIO } from "@blazetrails/ruby-compat";
import { Blob } from "../blob.js";
import { Filename } from "../filename.js";
import { MirrorJob } from "../mirror-job.js";
import { Service } from "../service.js";
import "./configurator.js";
import type { MirrorService } from "./mirror-service.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const mirrorConfig = Object.fromEntries(
  [1, 2, 3].map((i) => [
    `mirror_${i}`,
    { service: "Disk", root: Dir.mktmpdir(`active_storage_tests_mirror_${i}`) },
  ]),
);

const config = {
  ...mirrorConfig,
  mirror: { service: "Mirror", primary: "primary", mirrors: Object.keys(mirrorConfig) },
  primary: { service: "Disk", root: Dir.mktmpdir("active_storage_tests_primary") },
};

const SERVICE = Service.configure("mirror", config) as MirrorService;
const encode = (data: string) => new TextEncoder().encode(data);

class MirrorServiceTest extends TestCase {
  mirror(): void {}
}

describe("ActiveStorage::Service::MirrorServiceTest", () => {
  let t: TestHelper;

  beforeEach(async () => {
    t = new MirrorServiceTest("mirror") as unknown as TestHelper;
    await t.beforeSetup();
  });

  afterEach(async () => {
    await t.afterTeardown();
  });

  const ctx = SharedServiceTests(SERVICE);

  it("name", () => {
    expect(ctx.service.name).toBe("mirror");
  });

  it("uploading to all services", async () => {
    const oldService = Blob.service;
    Blob.service = ctx.service;

    const key = base58(24);
    const data = "Something else entirely!";
    const io = new StringIO(data);
    const checksum = OpenSSL.Digest.MD5.base64digest(data);

    try {
      io.read();
      await t.assertPerformedJobs(1, { only: MirrorJob }, async () => {
        await ctx.service.upload(key, io, { checksum: checksum });
      });

      expect(io.isEof()).toBeTruthy();

      expect(await ctx.service.primary.download(key)).toEqual(encode(data));
      for (const mirror of ctx.service.mirrors) {
        expect(await mirror.download(key)).toEqual(encode(data));
      }
    } finally {
      await ctx.service.delete(key);
      Blob.service = oldService;
    }
  });

  it("downloading from primary service", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    const checksum = OpenSSL.Digest.MD5.base64digest(data);

    await ctx.service.primary.upload(key, new StringIO(data), { checksum: checksum });

    expect(await ctx.service.download(key)).toEqual(encode(data));
  });

  it("deleting from all services", async () => {
    await ctx.service.delete(ctx.key);

    expect(await SERVICE.primary.isExist(ctx.key)).toBeFalsy();
    for (const mirror of SERVICE.mirrors) {
      expect(await mirror.isExist(ctx.key)).toBeFalsy();
    }
  });

  it("mirroring a file from the primary service to secondary services where it doesn't exist", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    const checksum = OpenSSL.Digest.MD5.base64digest(data);

    await ctx.service.primary.upload(key, new StringIO(data), { checksum: checksum });
    await ctx.service.mirrors[2].upload(key, new StringIO("Surprise!"));

    await ctx.service.mirror(key, { checksum: checksum });
    expect(await ctx.service.mirrors[0].download(key)).toEqual(encode(data));
    expect(await ctx.service.mirrors[1].download(key)).toEqual(encode(data));
    expect(await ctx.service.mirrors[2].download(key)).toEqual(encode("Surprise!"));
  });

  it("URL generation in primary service", () => {
    const filename = new Filename("test.txt");
    const options = {
      expiresIn: minutes(2),
      disposition: "inline",
      filename: filename,
      contentType: "text/plain",
    };

    freezeTime();
    try {
      expect(ctx.service.url(ctx.key, options)).toBe(ctx.service.primary.url(ctx.key, options));
    } finally {
      travelBack();
    }
  });

  it("path for file in primary service", () => {
    expect(ctx.service.pathFor(ctx.key)).toBe(
      (ctx.service.primary as unknown as MirrorService).pathFor(ctx.key),
    );
  });
});
