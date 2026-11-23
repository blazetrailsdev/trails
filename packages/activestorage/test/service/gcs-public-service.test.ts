import { describe, expect, it } from "vitest";
import { Storage } from "@google-cloud/storage";
import { base58 } from "@blazetrails/activesupport";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { Filename } from "../../lib/app/models/active-storage/filename.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import type { GCSService } from "../../lib/service/gcs-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { gcsConfiguration } from "../support/service-configurations.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.gcs_public
  ? (Service.configure("gcs_public", SERVICE_CONFIGURATIONS) as GCSService)
  : null;

function offlineService(): Service {
  return Service.configure("gcs_public", {
    gcs_public: { ...gcsConfiguration("trails-public"), public: true },
  });
}

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs_public)(
  "ActiveStorage::Service::GCSPublicServiceTest",
  () => {
    const ctx = SharedServiceTests(SERVICE!);

    it("public URL generation", async () => {
      const offlineUrl = await offlineService().url(ctx.key, {
        filename: new Filename("avatar.png"),
      });

      expect(offlineUrl).toMatch(new RegExp(`storage\\.googleapis\\.com/.*/${ctx.key}`));

      const url = await ctx.service.url(ctx.key, { filename: new Filename("avatar.png") });
      const response = await fetch(url);
      expect(String(response.status)).toBe("200");
    });

    it("direct upload", async () => {
      const key = base58(24);
      const data = "Something else entirely!";
      try {
        const checksum = OpenSSL.Digest.MD5.base64digest(data);
        const { apiEndpoint, project, credentials } = SERVICE_CONFIGURATIONS.gcs_public;
        const [v4Url] = await new Storage({
          apiEndpoint: apiEndpoint as string,
          projectId: project as string,
          credentials: credentials as object,
        })
          .bucket("trails-public")
          .file(key)
          .getSignedUrl({
            action: "write",
            version: "v4",
            expires: Date.now() + 5 * 60 * 1000,
            contentMd5: checksum,
            extensionHeaders: { "x-goog-content-length-range": `${data.length},${data.length}` },
          });
        await fetch(v4Url, {
          method: "PUT",
          body: data,
          headers: {
            "Content-Type": "",
            "Content-MD5": checksum,
            "x-goog-content-length-range": `${data.length},${data.length}`,
          },
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
