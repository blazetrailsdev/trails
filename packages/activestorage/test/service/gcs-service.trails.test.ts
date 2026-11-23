import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage } from "@google-cloud/storage";
import { minutes } from "@blazetrails/activesupport";
import { OpenSSL } from "@blazetrails/ruby-compat";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import { MetadataServerError, MetadataServerNotFoundError } from "../../lib/service/gcs-service.js";
import { gcsConfiguration } from "../support/service-configurations.js";

type Iam = { issuer(): Promise<string> };

function iamService(gcs: Record<string, unknown> = {}): Service & Iam {
  return Service.configure("gcs", {
    gcs: { ...gcsConfiguration("bucket"), iam: true, ...gcs },
  }) as unknown as Service & Iam;
}

function stubMetadataServer(email: string | null, { flavor = "Google" } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/computeMetadata/v1/"))
      return new Response("", { headers: { "Metadata-Flavor": flavor } });
    return email == null ? new Response("", { status: 404 }) : new Response(email);
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GCSService IAM signing", () => {
  it("issuer prefers gsaEmail over the metadata server", async () => {
    const calls = stubMetadataServer("metadata@project.iam.gserviceaccount.com");
    const service = iamService({ gsaEmail: "gsa@project.iam.gserviceaccount.com" });

    expect(await service.issuer()).toBe("gsa@project.iam.gserviceaccount.com");
    expect(calls).toEqual([]);
  });

  it("issuer falls back to the metadata server email, and memoizes", async () => {
    const calls = stubMetadataServer("metadata@project.iam.gserviceaccount.com");
    const service = iamService();

    expect(await service.issuer()).toBe("metadata@project.iam.gserviceaccount.com");
    expect(await service.issuer()).toBe("metadata@project.iam.gserviceaccount.com");
    expect(calls).toHaveLength(2);
  });

  it("raises MetadataServerNotFoundError without a metadata server", async () => {
    stubMetadataServer("unused", { flavor: "" });
    await expect(iamService().issuer()).rejects.toBeInstanceOf(MetadataServerNotFoundError);
  });

  it("raises MetadataServerError when the metadata server has no email", async () => {
    stubMetadataServer(null);
    await expect(iamService().issuer()).rejects.toBeInstanceOf(MetadataServerError);
  });

  it("signs a direct upload URL through IAM signBlob for the issuer", async () => {
    const GoogleAuth = new Storage().authClient.constructor as { prototype: object };
    const request = vi
      .spyOn(GoogleAuth.prototype as { request: (o: unknown) => unknown }, "request")
      .mockResolvedValue({ data: { signedBlob: "c2lnbmVk" } });
    const service = iamService({ gsaEmail: "gsa@project.iam.gserviceaccount.com" });

    const url = await service.urlForDirectUpload("key", {
      expiresIn: minutes(5),
      contentType: "text/plain",
      contentLength: 9,
      checksum: OpenSSL.Digest.MD5.base64digest("Some text"),
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/gsa@project.iam.gserviceaccount.com:signBlob",
        method: "POST",
      }),
    );
    const query = new URL(url).searchParams;
    expect(query.get("GoogleAccessId")).toBe("gsa@project.iam.gserviceaccount.com");
    expect(query.get("Signature")).toBe("c2lnbmVk");
  });
});
