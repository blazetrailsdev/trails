import { afterEach, describe, expect, it } from "vitest";
import { marshallingFormatVersion, setMarshallingFormatVersion } from "../../lib/active-record.js";
import { Methods } from "../../lib/marshalling.js";
import { Base } from "../../lib/base.js";
import { fixtures } from "../support/use-fixtures.js";
import { Comment } from "../models/comment.js";

describe("ActiveRecord.marshalling_format_version", () => {
  afterEach(() => setMarshallingFormatVersion(6.1));

  it("defaults to 6.1 and aliases marshal_dump only under 7.1", () => {
    expect(marshallingFormatVersion()).toBe(6.1);
    expect(Methods.isMethodDefined("marshalDump")).toBe(false);
    setMarshallingFormatVersion(7.1);
    expect(marshallingFormatVersion()).toBe(7.1);
    expect(Methods.instanceMethod("marshalDump")!.value).toBe(
      Methods.instanceMethod("_marshalDump71")!.value,
    );
    expect(typeof (Base.prototype as unknown as Record<string, unknown>).marshalDump).toBe(
      "function",
    );
    setMarshallingFormatVersion(6.1);
    expect("marshalDump" in Base.prototype).toBe(false);
    expect(Methods.isMethodDefined("marshalDump")).toBe(false);
  });

  it("raises ArgumentError for an unknown format", () => {
    expect(() => setMarshallingFormatVersion(5.0)).toThrow("Unknown marshalling format: 5");
    expect(() => setMarshallingFormatVersion("7.1")).toThrow('Unknown marshalling format: "7.1"');
    expect(marshallingFormatVersion()).toBe(6.1);
  });
});

describe("_marshal_dump_7_1", () => {
  fixtures(["posts", "comments"]);

  it("dumps a loaded record of a model with associations, with its cached associations", async () => {
    const comment = (await Comment.order("id").first()) as Comment;
    const dump = comment as unknown as { _marshalDump71(): unknown[] };
    expect(dump._marshalDump71()).toEqual([comment.attributesForDatabase(), false]);

    const post = await comment.post;
    expect(dump._marshalDump71()[2]).toEqual([["post", post]]);
  });
});
