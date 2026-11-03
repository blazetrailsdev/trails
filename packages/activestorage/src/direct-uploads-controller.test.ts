import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest, type RouteSet } from "@blazetrails/actionpack";
import { TopLevel, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Base } from "@blazetrails/activerecord";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { Blob } from "./blob.js";
import { Current } from "./current.js";
import "./direct-uploads-controller.js";

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

describe("ActiveStorage::S3DirectUploadsControllerTest", () => {
  // PERMANENT-SKIP: RFC 0209 non-goal — S3, GCS and Azure services (repo-owner scope ruling, 2026-10-28).
  it.skip("creating new direct upload", () => {});
});

describe("ActiveStorage::GCSDirectUploadsControllerTest", () => {
  // PERMANENT-SKIP: RFC 0209 non-goal — S3, GCS and Azure services (repo-owner scope ruling, 2026-10-28).
  it.skip("creating new direct upload", () => {});
});

describe("ActiveStorage::AzureStorageDirectUploadsControllerTest", () => {
  // PERMANENT-SKIP: RFC 0209 non-goal — S3, GCS and Azure services (repo-owner scope ruling, 2026-10-28).
  it.skip("creating new direct upload", () => {});
});

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

    const details = session.response.parsedBody as HashWithIndifferentAccess;
    expect(await Blob.findSignedBang(details.get("signedId") as string)).toEqual(
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

    const details = session.response.parsedBody as HashWithIndifferentAccess;
    expect(details.get("blob")).toBeUndefined();
    expect(details.get("id")).not.toBeNull();
  });
});

async function setIncludeRootInJson(value: boolean, block: () => Promise<void>): Promise<void> {
  const original = Base.includeRootInJson;
  try {
    Base.includeRootInJson = value;
    await block();
  } finally {
    Base.includeRootInJson = original;
  }
}
