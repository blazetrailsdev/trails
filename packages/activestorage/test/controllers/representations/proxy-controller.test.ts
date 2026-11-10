import { beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { StandardError } from "@blazetrails/ruby-compat";
import "../../support/database/setup.js";
import { ActiveStorage } from "../../../lib/active-storage.js";
import type { Blob } from "../../../lib/blob.js";
import { FileNotFoundError } from "../../../lib/errors.js";
import { Variation } from "../../../lib/variation.js";
import {
  createFileBlob,
  withoutVariantTracking,
  withStrictLoadingByDefault,
} from "../../support/test-helper.js";
import "../../../lib/representations/proxy-controller.js";

type Url = (...args: unknown[]) => string;
type Session = IntegrationTest & {
  integrationSession: { trailsBlobRepresentationProxyUrl: Url };
};

function integrationTest(name: string): Session {
  const t = new IntegrationTest(name) as Session;
  const routes = TopLevel.Trails!.application!.routes() as unknown as {
    call(env: unknown): unknown;
  };
  t.app = { routes: () => routes, call: (env: unknown) => routes.call(env) };
  return t;
}

function getRepresentationProxy(
  t: Session,
  blob: Blob,
  signedBlobId: string,
  variationKey: string,
  disposition?: string,
) {
  return t.get(
    t.integrationSession.trailsBlobRepresentationProxyUrl({
      ...(disposition ? { disposition } : {}),
      filename: blob.filename,
      signed_blob_id: signedBlobId,
      variation_key: variationKey,
    }),
  );
}

async function body(representation: { download(): Promise<unknown> }): Promise<string> {
  const bytes = (await representation.download()) as Uint8Array;
  let string = "";
  for (const byte of bytes) string += String.fromCharCode(byte);
  return string;
}

const transformations = { resizeToLimit: [100, 100] };

describe("ActiveStorage::Representations::ProxyControllerWithVariantsTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
  });

  it("showing variant attachment", async () => {
    await getRepresentationProxy(
      t,
      blob,
      blob.signedId(),
      Variation.encode(transformations),
      "attachment",
    );

    t.assertResponse("ok");
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^attachment/);
    expect(t.response.body).toBe(await body(blob.variant(transformations)));
  });

  it("showing variant inline", async () => {
    await getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations));

    t.assertResponse("ok");
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(t.response.body).toBe(await body(blob.variant(transformations)));
  });

  it("showing untracked variant", async () => {
    await withoutVariantTracking(async () => {
      await getRepresentationProxy(
        t,
        blob,
        blob.signedId(),
        Variation.encode(transformations),
        "attachment",
      );

      t.assertResponse("ok");
      expect(t.response.headers.get("Content-Disposition")).toMatch(/^attachment/);
      expect(t.response.body).toBe(await body(blob.variant(transformations)));
    });
  });

  it("showing variant with invalid signed blob ID", async () => {
    await getRepresentationProxy(t, blob, "invalid", Variation.encode(transformations));
    t.assertResponse("not_found");
  });

  it("showing variant with invalid variation key", async () => {
    await getRepresentationProxy(t, blob, blob.signedId(), "invalid");
    t.assertResponse("not_found");
  });
});

describe("ActiveStorage::Representations::ProxyControllerWithVariantsWithStrictLoadingTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
    await blob.variant(transformations).processed();
  });

  it("showing existing variant record", async () => {
    await withStrictLoadingByDefault(() =>
      getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations)),
    );

    t.assertResponse("ok");
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(t.response.body).toBe(await body(blob.variant(transformations)));
  });

  it("invalidates cache and returns a 404 if the file is not found on download", async () => {
    const mockDownload = () => {
      throw new FileNotFoundError("File still uploading!");
    };

    await stub(blob.service, "download", mockDownload, [], async () => {
      await getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations));
    });
    t.assertResponse("not_found");
    expect(t.response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("invalidates cache and returns a 500 if the an error is raised on download", async () => {
    const mockDownload = () => {
      throw new StandardError("Something is not cool!");
    };

    await stub(blob.service, "download", mockDownload, [], async () => {
      await getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations));
    });
    t.assertResponse("internal_server_error");
    expect(t.response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("ActiveStorage::Representations::ProxyControllerWithPreviewsTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
  });

  it("showing preview inline", async () => {
    await getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations));

    t.assertResponse("ok");
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(t.response.body).toBe(await body(blob.preview(transformations)));
  });

  it("showing preview with invalid signed blob ID", async () => {
    await getRepresentationProxy(t, blob, "invalid", Variation.encode(transformations));
    t.assertResponse("not_found");
  });

  it("showing preview with invalid variation key", async () => {
    await getRepresentationProxy(t, blob, blob.signedId(), "invalid");
    t.assertResponse("not_found");
  });
});

describe("ActiveStorage::Representations::ProxyControllerWithPreviewsWithStrictLoadingTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    await blob.preview(transformations).processed();
  });

  it("showing existing preview record", async () => {
    await withStrictLoadingByDefault(() =>
      getRepresentationProxy(t, blob, blob.signedId(), Variation.encode(transformations)),
    );

    t.assertResponse("ok");
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(t.response.body).toBe(await body(blob.preview(transformations)));
  });
});
