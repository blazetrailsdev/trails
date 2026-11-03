import { beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { IntegrationTest } from "@blazetrails/actionpack";
import "../../test-helpers/database/setup.js";
import { ActiveStorage } from "../../active-storage.js";
import type { Blob } from "../../blob.js";
import { Variation } from "../../variation.js";
import {
  SERVICE_CONFIGURATIONS,
  createFileBlob,
  readImage,
  withRaiseOnOpenRedirects,
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
type Variable = Blob & {
  previewImage: { load(): Promise<unknown>; isAttached(): boolean; variant(t: unknown): unknown };
};

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

    await blob.previewImage.load();
    expect(blob.previewImage.isAttached()).toBeTruthy();
    t.assertRedirectedTo(/report\.png/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    const image = await readImage((await blob.previewImage.variant(resizeToLimit)) as Readable);
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

    await blob.previewImage.load();
    expect(blob.previewImage.isAttached()).toBeTruthy();
    t.assertRedirectedTo(/report\.png/);
    await t.followRedirectBang();
    expect(t.response.headers.get("Content-Disposition")).toMatch(/^inline/);

    await blob.reload();
    await blob.previewImage.load();
    const image = await readImage((await blob.previewImage.variant(resizeToLimit)) as Readable);
    expect(await image.width()).toBe(77);
    expect(await image.height()).toBe(100);
  });
});

describe("ActiveStorage::Representations::RedirectControllerWithOpenRedirectTest", () => {
  let t: Session;

  beforeEach(({ task }) => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    t = integrationTest(task.name);
  });

  it.skipIf(!(SERVICE_CONFIGURATIONS as Record<string, unknown>).s3)(
    "showing existing variant stored in s3",
    async () => {
      await withRaiseOnOpenRedirects("s3", async () => {
        const blob = await createFileBlob({ filename: "racecar.jpg", serviceName: "s3" });

        await getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit));

        t.assertRedirectedTo(/racecar\.jpg/);
      });
    },
  );

  it.skipIf(!(SERVICE_CONFIGURATIONS as Record<string, unknown>).azure)(
    "showing existing variant stored in azure",
    async () => {
      await withRaiseOnOpenRedirects("azure", async () => {
        const blob = await createFileBlob({ filename: "racecar.jpg", serviceName: "azure" });

        await getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit));

        t.assertRedirectedTo(/racecar\.jpg/);
      });
    },
  );

  it.skipIf(!(SERVICE_CONFIGURATIONS as Record<string, unknown>).gcs)(
    "showing existing variant stored in gcs",
    async () => {
      await withRaiseOnOpenRedirects("gcs", async () => {
        const blob = await createFileBlob({ filename: "racecar.jpg", serviceName: "gcs" });

        await getRepresentation(t, blob, blob.signedId(), Variation.encode(resizeToLimit));

        t.assertRedirectedTo(/racecar\.jpg/);
      });
    },
  );
});
