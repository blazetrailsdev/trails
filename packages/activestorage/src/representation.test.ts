import "./test-helpers/database/setup.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActiveStorage } from "./active-storage.js";
import { Current } from "./current.js";
import { UnrepresentableError } from "./errors.js";
import { createBlob, createFileBlob, readImage } from "./test-helpers/test-helper.js";

type Representation = {
  processed(): Promise<{ image: unknown }>;
};

describe("ActiveStorage::RepresentationTest", { timeout: 30_000 }, () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  });

  afterEach(() => {
    Current.reset();
  });

  const imageOf = async (representation: { image: unknown }) =>
    readImage((await representation.image) as Parameters<typeof readImage>[0]);

  it("representing an image", async () => {
    const blob = await createFileBlob();
    const representation = await (
      blob.representation({ resizeToLimit: [100, 100] }) as Representation
    ).processed();

    const image = await imageOf(representation);
    expect(await image.width()).toBe(100);
    expect(await image.height()).toBe(67);
  });

  it("representing a PDF", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const representation = await (
      blob.representation({ resizeToLimit: [640, 280] }) as Representation
    ).processed();

    const image = await imageOf(representation);
    expect(await image.width()).toBe(612);
    expect(await image.height()).toBe(792);
  });

  it("representing a PDF-based Illustrator file", async () => {
    const blob = await createFileBlob({
      fixture: "report.pdf",
      filename: "file.ai",
      contentType: "application/illustrator",
    });
    const representation = await (
      blob.representation({ resizeToLimit: [640, 280] }) as Representation
    ).processed();

    const image = await imageOf(representation);
    expect(await image.width()).toBe(612);
    expect(await image.height()).toBe(792);
  });

  it("representing an MP4 video", async () => {
    const blob = await createFileBlob({ filename: "video.mp4", contentType: "video/mp4" });
    const representation = await (
      blob.representation({ resizeToLimit: [640, 280] }) as Representation
    ).processed();

    const image = await imageOf(representation);
    expect(await image.width()).toBe(640);
    expect(await image.height()).toBe(480);
  });

  it("representing an unrepresentable blob", async () => {
    const blob = await createBlob();
    expect(() => blob.representation({ resizeToLimit: [100, 100] })).toThrow(UnrepresentableError);
    expect(() => blob.representation({ resizeToLimit: [100, 100] })).toThrow(
      /blob with ID=\d+ and content_type=text\/plain/,
    );
  });
});
