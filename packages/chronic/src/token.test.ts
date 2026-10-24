import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { rbCString, rbObjClass } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";
import type { Tag } from "./tag.js";

describe("TestToken", () => {
  beforeEach(() => {
    Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("token", () => {
    const token = new Chronic.Token("foo");
    expect(token.tags.length).toEqual(0);
    expect(!token.isTagged()).toBeTruthy();
    token.tag("mytag" as unknown as Tag);
    expect(token.tags.length).toEqual(1);
    expect(token.isTagged()).toBeTruthy();
    expect(rbObjClass(token.getTag(rbCString))).toEqual(rbCString);
    token.tag(5 as unknown as Tag);
    expect(token.tags.length).toEqual(2);
    token.untag(rbCString);
    expect(token.tags.length).toEqual(1);
    expect(token.word).toEqual("foo");
  });
});
