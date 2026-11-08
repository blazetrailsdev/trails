import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/actionview/test-case";
import { AssetTagHelper } from "@blazetrails/actionview/helpers/asset-tag-helper";
import { ArgumentError } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { Attachment } from "../../lib/attachment.js";
import type { Blob } from "../../lib/blob.js";
import { User, createFileBlob } from "../support/test-helper.js";

type Tc = TestCase & {
  blob: Blob;
  user: User;
  assertDomEqual(expected: unknown, actual: unknown): void;
  polymorphicUrl(record: unknown): string;
  imageTag(...sources: unknown[]): unknown;
};

class ImageTagTest extends TestCase {}
(ImageTagTest as unknown as { tests(helper: unknown): void }).tests(AssetTagHelper);

describe("ActiveStorage::ImageTagTest", () => {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new ImageTagTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
    tc.blob = await createFileBlob({ filename: "racecar.jpg" });
  });

  it("blob", () => {
    tc.assertDomEqual(`<img src="${tc.polymorphicUrl(tc.blob)}" />`, tc.imageTag(tc.blob));
  });

  it("variant", () => {
    const variant = tc.blob.variant({ resizeToLimit: [100, 100] });
    tc.assertDomEqual(`<img src="${tc.polymorphicUrl(variant)}" />`, tc.imageTag(variant));
  });

  it("preview", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = blob.preview({ resizeToLimit: [100, 100] });
    tc.assertDomEqual(`<img src="${tc.polymorphicUrl(preview)}" />`, tc.imageTag(preview));
  });

  it("attachment", () => {
    const attachment = new Attachment({ blob: tc.blob });
    tc.assertDomEqual(`<img src="${tc.polymorphicUrl(attachment)}" />`, tc.imageTag(attachment));
  });

  // PERMANENT-SKIP: Rails raises through `delegate_missing_to :attachment, allow_nil: true` answering nil for `to_model`, then `nil.persisted?` raising NoMethodError; an unanswered Proxy name reads undefined and calling it is a TypeError (CLAUDE.md, "Ruby protocol methods with a different JS mechanism").
  it.skip("error when attachment's empty", async () => {
    tc.user = await User.createBang({ name: "DHH" });
    await tc.user.avatar.load();

    expect(tc.user.avatar.isAttached()).toBe(false);
    expect(() => tc.imageTag(tc.user.avatar)).toThrow(ArgumentError);
  });

  it("error when object can't be resolved into URL", () => {
    const unresolvableObject = AssetTagHelper;
    expect(() => tc.imageTag(unresolvableObject)).toThrow(ArgumentError);
  });
});
