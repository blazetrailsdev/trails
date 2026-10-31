import { describe, expect, it } from "vitest";
import type { Extended } from "@blazetrails/activesupport";
import "./test-helpers/database/setup.js";
import type { HasAttachedReflection, ClassMethods } from "./reflection.js";
import { Group, User } from "./test-helpers/test-helper.js";

const UserReflect = User as unknown as Extended<typeof ClassMethods>;
const GroupReflect = Group as unknown as Extended<typeof ClassMethods>;

const byName = (a: HasAttachedReflection, b: HasAttachedReflection) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

describe("ActiveStorage::ReflectionTest", () => {
  it("reflecting on a singular attachment", () => {
    let reflection = UserReflect.reflectOnAttachment("avatar")!;
    expect(reflection.activeRecord).toBe(User);
    expect(reflection.name).toBe("avatar");
    expect((reflection as unknown as { macro: string }).macro).toBe("hasOneAttached");
    expect(reflection.options.dependent).toBe("purge_later");

    reflection = UserReflect.reflectOnAttachment("coverPhoto")!;
    expect(reflection.options.serviceName).toBe("local");

    reflection = UserReflect.reflectOnAttachment("avatarWithVariants")!;
    expect(reflection.namedVariants).toBeInstanceOf(Object);
  });

  it("reflection on a singular attachment with the same name as an attachment on another model", () => {
    const reflection = GroupReflect.reflectOnAttachment("avatar")!;
    expect(reflection.activeRecord).toBe(Group);
  });

  it("reflecting on a collection attachment", () => {
    let reflection = UserReflect.reflectOnAttachment("highlights")!;
    expect(reflection.activeRecord).toBe(User);
    expect(reflection.name).toBe("highlights");
    expect((reflection as unknown as { macro: string }).macro).toBe("hasManyAttached");
    expect(reflection.options.dependent).toBe("purge_later");

    reflection = UserReflect.reflectOnAttachment("vlogs")!;
    expect(reflection.options.serviceName).toBe("local");

    reflection = UserReflect.reflectOnAttachment("highlightsWithVariants")!;
    expect(reflection.namedVariants).toBeInstanceOf(Object);
  });

  it("reflecting on all attachments", () => {
    const reflections = [...UserReflect.reflectOnAllAttachments()].sort(byName);
    expect([...new Set(reflections.map((reflection) => reflection.activeRecord))]).toEqual([User]);
    expect(reflections.map((reflection) => reflection.name)).toEqual([
      "avatar",
      "avatarWithConditionalPreprocessed",
      "avatarWithPreprocessed",
      "avatarWithVariants",
      "coverPhoto",
      "highlights",
      "highlightsWithConditionalPreprocessed",
      "highlightsWithPreprocessed",
      "highlightsWithVariants",
      "introVideo",
      "namePronunciationAudio",
      "resume",
      "resumeWithPreprocessing",
      "vlogs",
    ]);
    const one = "hasOneAttached";
    const many = "hasManyAttached";
    expect(reflections.map((r) => (r as unknown as { macro: string }).macro)).toEqual([
      one,
      one,
      one,
      one,
      one,
      many,
      many,
      many,
      many,
      one,
      one,
      one,
      one,
      many,
    ]);
    const later = "purge_later";
    expect(reflections.map((reflection) => reflection.options.dependent)).toEqual([
      later,
      later,
      later,
      later,
      false,
      later,
      later,
      later,
      later,
      later,
      later,
      later,
      later,
      false,
    ]);
  });
});
