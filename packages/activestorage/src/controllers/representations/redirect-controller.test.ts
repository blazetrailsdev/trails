import { beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { IntegrationTest } from "@blazetrails/actionpack";
import "../../test-helpers/database/setup.js";
import { ActiveStorage } from "../../active-storage.js";
import type { Blob } from "../../blob.js";
import { Variation } from "../../variation.js";
import {
  createFileBlob,
  readImage,
  withStrictLoadingByDefault,
} from "../../test-helpers/test-helper.js";
import "../../representations/redirect-controller.js";

type Url = (...args: unknown[]) => string;
type Session = IntegrationTest & {
  integrationSession: { trailsBlobRepresentationUrl: Url };
};

function integrationTest(name: string): Session {
  const t = new IntegrationTest(name) as Session;
  const routes = TopLevel.Trails!.application!.routes() as unknown as {
    call(env: unknown): unknown;
  };
  t.app = { routes: () => routes, call: (env: unknown) => routes.call(env) };
  return t;
}

type Readable = Parameters<typeof readImage>[0];
type Variable = Blob & { previewImage: { isAttached(): boolean; variant(t: unknown): unknown } };

function getRepresentation(t: Session, blob: Blob, signedBlobId: string, variationKey: string) {
  return t.get(
    t.integrationSession.trailsBlobRepresentationUrl({
      filename: blob.filename,
      signed_blob_id: signedBlobId,
      variation_key: variationKey,
    }),
  );
}

const resizeToLimit = { resizeToLimit: [100, 100] };

describe("ActiveStorage::Representations::RedirectControllerWithVariantsTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
  });

  it("showing variant inline", async () => {
    await getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit));

    t.assertRedirectedTo(/racecar\.jpg/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    const image = await readImage(blob.variant(resizeToLimit) as unknown as Readable);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
  });

  it("showing variant with invalid signed blob ID", async () => {
    await getRepresentation(t, blob, "invalid", Variation.encode(resizeToLimit));
    t.assertResponse("not_found");
  });

  it("showing variant with invalid variation key", async () => {
    await getRepresentation(t, blob, blob.signedId(), "invalid");
    t.assertResponse("not_found");
  });
});

describe("ActiveStorage::Representations::RedirectControllerWithVariantsWithStrictLoadingTest", () => {
  let t: Session;
  let blob: Blob;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = await createFileBlob({ filename: "racecar.jpg" });
    await blob.variant(resizeToLimit).processed();
  });

  it("showing existing variant record inline", async () => {
    await withStrictLoadingByDefault(() =>
      getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit)),
    );

    t.assertRedirectedTo(/racecar\.jpg/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    await blob.reload();
    const image = await readImage(blob.variant(resizeToLimit) as unknown as Readable);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
  });
});

describe("ActiveStorage::Representations::RedirectControllerWithPreviewsTest", () => {
  let t: Session;
  let blob: Variable;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = (await createFileBlob({
      filename: "report.pdf",
      contentType: "application/pdf",
    })) as Variable;
  });

  it("showing preview inline", async () => {
    await getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit));

    expect(blob.previewImage.isAttached()).toBe(true);
    t.assertRedirectedTo(/report\.png/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    const image = await readImage(blob.previewImage.variant(resizeToLimit) as Readable);
    expect(await image.width()).toBe(77);
    expect(await image.height()).toBe(100);
  });

  it("showing preview with invalid signed blob ID", async () => {
    await getRepresentation(t, blob, "invalid", Variation.encode(resizeToLimit));
    t.assertResponse("not_found");
  });

  it("showing preview with invalid variation key", async () => {
    await getRepresentation(t, blob, blob.signedId(), "invalid");
    t.assertResponse("not_found");
  });
});

describe("ActiveStorage::Representations::RedirectControllerWithPreviewsWithStrictLoadingTest", () => {
  let t: Session;
  let blob: Variable;

  beforeEach(async ({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
    blob = (await createFileBlob({
      filename: "report.pdf",
      contentType: "application/pdf",
    })) as Variable;
    const preview = await blob.preview(resizeToLimit).processed();
    await (
      await (
        preview as unknown as { variant(): Promise<{ processed(): Promise<unknown> }> }
      ).variant()
    ).processed();
  });

  it("showing existing preview record inline", async () => {
    await withStrictLoadingByDefault(() =>
      getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit)),
    );

    expect(blob.previewImage.isAttached()).toBe(true);
    t.assertRedirectedTo(/report\.png/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    await blob.reload();
    const image = await readImage(blob.previewImage.variant(resizeToLimit) as Readable);
    expect(await image.width()).toBe(77);
    expect(await image.height()).toBe(100);
  });
});
