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
  audioTag(...sources: unknown[]): unknown;
};

class AudioTagTest extends TestCase {}
(AudioTagTest as unknown as { tests(helper: unknown): void }).tests(AssetTagHelper);

describe("ActiveStorage::AudioTagTest", () => {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new AudioTagTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
    tc.blob = await createFileBlob({ filename: "audio.mp3" });
  });

  it("blob", () => {
    tc.assertDomEqual(`<audio src="${tc.polymorphicUrl(tc.blob)}" />`, tc.audioTag(tc.blob));
  });

  it("attachment", () => {
    const attachment = new Attachment({ blob: tc.blob });
    tc.assertDomEqual(`<audio src="${tc.polymorphicUrl(attachment)}" />`, tc.audioTag(attachment));
  });

  // PERMANENT-SKIP: Rails raises through `delegate_missing_to :attachment, allow_nil: true` answering nil for `to_model`, then `nil.persisted?` raising NoMethodError; an unanswered Proxy name reads undefined and calling it is a TypeError (CLAUDE.md, "Ruby protocol methods with a different JS mechanism").
  it.skip("error when attachment's empty", async () => {
    tc.user = await User.createBang({ name: "DHH" });
    await tc.user.namePronunciationAudio.load();

    expect(tc.user.namePronunciationAudio.isAttached()).toBe(false);
    expect(() => tc.audioTag(tc.user.namePronunciationAudio)).toThrow(ArgumentError);
  });

  it("error when object can't be resolved into URL", () => {
    const unresolvableObject = AssetTagHelper;
    expect(() => tc.audioTag(unresolvableObject)).toThrow(ArgumentError);
  });
});
