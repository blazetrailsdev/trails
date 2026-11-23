import { describe, expect, it } from "vitest";
import { base58, minutes } from "@blazetrails/activesupport";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { Filename } from "../../lib/filename.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import type { S3Service } from "../../lib/service/s3-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { s3Configuration } from "../support/service-configurations.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.s3_public
  ? (Service.configure("s3_public", SERVICE_CONFIGURATIONS) as S3Service)
  : null;

describe.skipIf(!SERVICE_CONFIGURATIONS.s3_public)(
  "ActiveStorage::Service::S3PublicServiceTest",
  () => {
    const ctx = SharedServiceTests(SERVICE!);

    it("public acl options", () => {
      expect(ctx.service.uploadOptions.acl).toBe("public-read");
    });

    it("public URL generation", async () => {
      const offline = Service.configure("s3_public", {
        s3_public: { ...s3Configuration("trails-public"), public: true },
      });
      const offlineUrl = await offline.url(ctx.key, { filename: new Filename("avatar.png") });

      expect(offlineUrl).toMatch(
        new RegExp(`s3(-[-a-z0-9]+)?\\.(\\S+)?amazonaws\\.com/${ctx.key}`),
      );

      const url = await ctx.service.url(ctx.key, { filename: new Filename("avatar.png") });
      const response = await fetch(url);
      expect(String(response.status)).toBe("200");
    });

    it("public URL generation (virtual host enabled)", async () => {
      const url = await ctx.service.url(ctx.key, {
        filename: new Filename("avatar.png"),
        virtualHost: true,
      });

      expect(url).toMatch(new RegExp(`${ctx.service.bucket}/${ctx.key}`));

      const { host, pathname } = new URL(url);
      const response = await fetch(
        `${String(SERVICE_CONFIGURATIONS.s3_public.endpoint)}/${host}${pathname}`,
      );
      expect(String(response.status)).toBe("200");
    });

    it("direct upload", async () => {
      const key = base58(24);
      const data = "Something else entirely!";
      try {
        const checksum = OpenSSL.Digest.MD5.base64digest(data);
        const url = await ctx.service.urlForDirectUpload(key, {
          expiresIn: minutes(5),
          contentType: "text/plain",
          contentLength: data.length,
          checksum: checksum,
        });

        await fetch(url, {
          method: "PUT",
          body: data,
          headers: { "Content-Type": "text/plain", "Content-MD5": checksum },
        });

        const response = await fetch(await ctx.service.url(key));
        expect(String(response.status)).toBe("200");
        expect(await response.text()).toBe(data);
      } finally {
        await ctx.service.delete(key);
      }
    });
  },
);
