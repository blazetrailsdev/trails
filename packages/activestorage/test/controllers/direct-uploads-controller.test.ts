import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Base } from "@blazetrails/activerecord";
import { isPresent } from "@blazetrails/activesupport";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { ActiveStorage } from "../../lib/active-storage.js";
import { Blob } from "../../lib/app/models/active-storage/blob.js";
import { Current } from "../../lib/app/models/active-storage/current.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import { Registry } from "../../lib/service/registry.js";
import { SERVICE_CONFIGURATIONS, offlineServiceConfigurations } from "../support/test-helper.js";
import "../../lib/app/controllers/active-storage/direct-uploads-controller.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let session: IntegrationTest;

beforeEach(() => {
  ActiveStorage.verifier = new MessageVerifier("Testing");
  Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  session = new IntegrationTest(expect.getState().currentTestName!);
  session.app = routes;
});

afterEach(() => {
  Current.reset();
});

function trailsDirectUploadsUrl(): string {
  return (
    routes.urlHelpers() as unknown as { trailsDirectUploadsUrl(o: object): string }
  ).trailsDirectUploadsUrl({ host: "www.example.com" });
}

describe("ActiveStorage::DiskDirectUploadsControllerTest", () => {
  it("creating new direct upload", async () => {
    const checksum = OpenSSL.Digest.MD5.base64digest("Hello");
    const metadata = {
      foo: "bar",
      my_key_1: "my_value_1",
      my_key_2: "my_value_2",
      platform: "my_platform",
      library_ID: "12345",
    };

    await session.post(trailsDirectUploadsUrl(), {
      params: {
        blob: {
          filename: "hello.txt",
          byte_size: 6,
          checksum: checksum,
          content_type: "text/plain",
          metadata: metadata,
        },
      },
    });

    const details = session.response.parsedBody;
    expect(await Blob.findSignedBang(details.get("signed_id") as string)).toEqual(
      await Blob.find(details.get("id") as number),
    );
    expect(details.get("filename")).toBe("hello.txt");
    expect(details.get("byte_size")).toBe(6);
    expect(details.get("checksum")).toBe(checksum);
    expect((details.get("metadata") as HashWithIndifferentAccess).toHash()).toEqual(metadata);
    expect(details.get("content_type")).toBe("text/plain");
    expect((details.get("direct_upload") as HashWithIndifferentAccess).get("url")).toMatch(
      /trails\/active_storage\/disk/,
    );
    expect(
      (
        (details.get("direct_upload") as HashWithIndifferentAccess).get(
          "headers",
        ) as HashWithIndifferentAccess
      ).toHash(),
    ).toEqual({ "Content-Type": "text/plain" });
  });

  it("creating new direct upload does not include root in json", async () => {
    const checksum = OpenSSL.Digest.MD5.base64digest("Hello");
    const metadata = {
      foo: "bar",
      my_key_1: "my_value_1",
      my_key_2: "my_value_2",
      platform: "my_platform",
      library_ID: "12345",
    };

    await setIncludeRootInJson(true, async () => {
      await session.post(trailsDirectUploadsUrl(), {
        params: {
          blob: {
            filename: "hello.txt",
            byte_size: 6,
            checksum: checksum,
            content_type: "text/plain",
            metadata: metadata,
          },
        },
      });
    });

    const details = session.response.parsedBody;
    expect(details.get("blob")).toBeUndefined();
    expect(details.get("id")).not.toBeNull();
  });
});

describe.skipIf(!(SERVICE_CONFIGURATIONS.s3 && isPresent(SERVICE_CONFIGURATIONS.s3.accessKeyId)))(
  "ActiveStorage::S3DirectUploadsControllerTest",
  () => {
    let config: Record<string, unknown>;
    let oldService: Service | null | undefined;
    let oldServices: Registry;

    beforeEach(() => {
      const configurations = offlineServiceConfigurations();
      config = configurations.s3;
      oldService = Blob.service;
      Blob.service = Service.configure("s3", configurations);
      oldServices = Blob.services;
      Blob.services = new Registry(configurations);
    });

    afterEach(() => {
      Blob.service = oldService;
      Blob.services = oldServices;
    });

    it("creating new direct upload", async () => {
      const checksum = OpenSSL.Digest.MD5.base64digest("Hello");
      const metadata = {
        foo: "bar",
        my_key_1: "my_value_1",
        my_key_2: "my_value_2",
        platform: "my_platform",
        library_ID: "12345",
        custom: {
          my_key_3: "my_value_3",
        },
      };

      await session.post(trailsDirectUploadsUrl(), {
        params: {
          blob: {
            filename: "hello.txt",
            byte_size: 6,
            checksum: checksum,
            content_type: "text/plain",
            metadata: metadata,
          },
        },
      });

      const details = session.response.parsedBody;
      const directUpload = details.get("direct_upload") as HashWithIndifferentAccess;
      expect(await Blob.findSignedBang(details.get("signed_id") as string)).toEqual(
        await Blob.find(details.get("id") as number),
      );
      expect(details.get("filename")).toBe("hello.txt");
      expect(details.get("byte_size")).toBe(6);
      expect(details.get("checksum")).toBe(checksum);
      expect((details.get("metadata") as HashWithIndifferentAccess).toHash()).toEqual(metadata);
      expect(details.get("content_type")).toBe("text/plain");
      expect(directUpload.get("url")).toMatch(String(config.bucket));
      expect(directUpload.get("url")).toMatch(/s3(-[-a-z0-9]+)?\.(\S+)?amazonaws\.com/);
      expect((directUpload.get("headers") as HashWithIndifferentAccess).toHash()).toEqual({
        "Content-Type": "text/plain",
        "Content-MD5": checksum,
        "Content-Disposition": "inline; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
        "x-amz-meta-my_key_3": "my_value_3",
      });
    });
  },
);

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs)(
  "ActiveStorage::GCSDirectUploadsControllerTest",
  () => {
    let config: Record<string, unknown>;
    let oldService: Service | null | undefined;
    let oldServices: Registry;

    beforeEach(() => {
      const configurations = offlineServiceConfigurations();
      config = configurations.gcs;
      oldService = Blob.service;
      Blob.service = Service.configure("gcs", configurations);
      oldServices = Blob.services;
      Blob.services = new Registry(configurations);
    });

    afterEach(() => {
      Blob.service = oldService;
      Blob.services = oldServices;
    });

    it("creating new direct upload", async () => {
      const checksum = OpenSSL.Digest.MD5.base64digest("Hello");
      const metadata = {
        foo: "bar",
        my_key_1: "my_value_1",
        my_key_2: "my_value_2",
        platform: "my_platform",
        library_ID: "12345",
        custom: {
          my_key_3: "my_value_3",
        },
      };

      await session.post(trailsDirectUploadsUrl(), {
        params: {
          blob: {
            filename: "hello.txt",
            byte_size: 6,
            checksum: checksum,
            content_type: "text/plain",
            metadata: metadata,
          },
        },
      });

      const details = session.response.parsedBody;
      const directUpload = details.get("direct_upload") as HashWithIndifferentAccess;
      expect(await Blob.findSignedBang(details.get("signed_id") as string)).toEqual(
        await Blob.find(details.get("id") as number),
      );
      expect(details.get("filename")).toBe("hello.txt");
      expect(details.get("byte_size")).toBe(6);
      expect(details.get("checksum")).toBe(checksum);
      expect((details.get("metadata") as HashWithIndifferentAccess).toHash()).toEqual(metadata);
      expect(details.get("content_type")).toBe("text/plain");
      expect(directUpload.get("url")).toMatch(
        new RegExp(`storage\\.googleapis\\.com/${String(config.bucket)}`),
      );
      expect((directUpload.get("headers") as HashWithIndifferentAccess).toHash()).toEqual({
        "Content-MD5": checksum,
        "Content-Disposition": "inline; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
        "x-goog-content-length-range": "6,6",
        "x-goog-meta-my_key_3": "my_value_3",
      });
    });
  },
);

async function setIncludeRootInJson(value: boolean, block: () => Promise<void>): Promise<void> {
  const original = Base.includeRootInJson;
  try {
    Base.includeRootInJson = value;
    await block();
  } finally {
    Base.includeRootInJson = original;
  }
}
