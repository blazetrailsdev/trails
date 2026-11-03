import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/actionview/test-case";
import { AssetTagHelper } from "@blazetrails/actionview/helpers/asset-tag-helper";
import { ArgumentError } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { Attachment } from "../attachment.js";
import type { Blob } from "../blob.js";
import { User, createFileBlob } from "../test-helpers/test-helper.js";

type Tc = TestCase & {
  blob: Blob;
  user: User;
  assertDomEqual(expected: unknown, actual: unknown): void;
  polymorphicUrl(record: unknown): string;
  videoTag(...sources: unknown[]): unknown;
};

class VideoTagTest extends TestCase {}
(VideoTagTest as unknown as { tests(helper: unknown): void }).tests(AssetTagHelper);

describe("ActiveStorage::VideoTagTest", () => {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new VideoTagTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
    tc.blob = await createFileBlob({ filename: "video.mp4" });
  });

  it("blob", () => {
    tc.assertDomEqual(`<video src="${tc.polymorphicUrl(tc.blob)}" />`, tc.videoTag(tc.blob));
  });

  it("attachment", () => {
    const attachment = new Attachment({ blob: tc.blob });
    tc.assertDomEqual(`<video src="${tc.polymorphicUrl(attachment)}" />`, tc.videoTag(attachment));
  });

  // PERMANENT-SKIP: Rails raises through `delegate_missing_to :attachment, allow_nil: true` answering nil for `to_model`, then `nil.persisted?` raising NoMethodError; an unanswered Proxy name reads undefined and calling it is a TypeError (CLAUDE.md, "Ruby protocol methods with a different JS mechanism").
  it.skip("error when attachment's empty", async () => {
    tc.user = await User.createBang({ name: "DHH" });
    await tc.user.introVideo.load();

    expect(tc.user.introVideo.isAttached()).toBe(false);
    expect(() => tc.videoTag(tc.user.introVideo)).toThrow(ArgumentError);
  });

  it("error when object can't be resolved into URL", () => {
    const unresolvableObject = AssetTagHelper;
    expect(() => tc.videoTag(unresolvableObject)).toThrow(ArgumentError);
  });
});
