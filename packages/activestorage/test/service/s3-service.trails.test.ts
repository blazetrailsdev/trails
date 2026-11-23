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
});
