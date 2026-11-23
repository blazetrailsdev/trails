import { ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { base58 } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import type { S3Service } from "../../lib/service/s3-service.js";
import "../../lib/service/s3-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";

const SERVICE = SERVICE_CONFIGURATIONS.s3
  ? (Service.configure("s3", SERVICE_CONFIGURATIONS) as S3Service)
  : null;

describe.skipIf(!SERVICE_CONFIGURATIONS.s3)("S3Service (trails)", () => {
  it("deletePrefixed pages past 1,000 keys", { timeout: 60_000 }, async () => {
    const prefix = `${base58(24)}/`;
    const keys = Array.from({ length: 1001 }, (_, i) => `${prefix}${i}`);
    for (let i = 0; i < keys.length; i += 100)
      await Promise.all(
        keys.slice(i, i + 100).map((key) => SERVICE!.upload(key, new StringIO("x"))),
      );

    await SERVICE!.deletePrefixed(prefix);
    expect(await SERVICE!.isExist(`${prefix}999`)).toBe(false);
  });

  it("a failed source stream rejects compose", async () => {
    const destinationKey = base58(24);

    await expect(SERVICE!.compose([base58(24)], destinationKey)).rejects.toThrow();

    expect(await SERVICE!.isExist(destinationKey)).toBe(false);
  });

  it("compose waits for the upload to drain each write", { timeout: 120_000 }, async () => {
    const service = Service.configure("s3", SERVICE_CONFIGURATIONS) as S3Service;
    const chunk = 5 * 1024 * 1024;
    const sourceKeys = [base58(24), base58(24), base58(24), base58(24)];
    for (const key of sourceKeys) await service.upload(key, new StringIO("x".repeat(3 * chunk)));
    let read = 0;
    let sent = 0;
    let held = 0;
    service.client.middlewareStack.add(
      (next, context) => async (args) => {
        const input = args.input as { Range?: string; Body?: Uint8Array };
        if (context.commandName === "UploadPartCommand") {
          await new Promise((resolve) => setTimeout(resolve, 250));
          sent += input.Body?.byteLength ?? 0;
        }
        const result = await next(args);
        if (context.commandName === "GetObjectCommand" && input.Range !== undefined) {
          const [first, last] = input.Range.slice("bytes=".length).split("-").map(Number);
          read += last - first + 1;
          held = Math.max(held, read - sent);
        }
        return result;
      },
      { step: "initialize", name: "drainProbe" },
    );
    const destinationKey = base58(24);

    await service.compose(sourceKeys, destinationKey);

    expect(read).toBe(12 * chunk);
    const queueSize = 4;
    expect(held).toBeLessThanOrEqual((queueSize + 3) * chunk);
  });

  it(
    "a failed part upload rejects compose and aborts the upload",
    { timeout: 60_000 },
    async () => {
      const service = Service.configure("s3", SERVICE_CONFIGURATIONS) as S3Service;
      const chunk = 5 * 1024 * 1024;
      const sourceKey = base58(24);
      await service.upload(sourceKey, new StringIO("x".repeat(3 * chunk)));
      service.client.middlewareStack.add(
        (next, context) => async (args) => {
          if (context.commandName === "UploadPartCommand") throw new Error("UploadPart failed");
          return await next(args);
        },
        { step: "initialize", name: "failUploadPart" },
      );
      const destinationKey = base58(24);

      await expect(service.compose([sourceKey, sourceKey], destinationKey)).rejects.toThrow(
        "UploadPart failed",
      );

      const { Uploads } = await service.client.send(
        new ListMultipartUploadsCommand({ Bucket: service.bucket, Prefix: destinationKey }),
      );
      expect(Uploads ?? []).toEqual([]);
      expect(await service.isExist(destinationKey)).toBe(false);
    },
  );
});
