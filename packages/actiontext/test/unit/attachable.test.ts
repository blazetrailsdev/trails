import { describe, expect, it } from "vitest";
import { ActiveStorage } from "@blazetrails/activestorage";
import { StringIO } from "@blazetrails/ruby-compat";
import { fixturesAll } from "../test-helper.js";

type AttachableBlob = {
  id: unknown;
  asJson(options?: Record<string, unknown>): Record<string, unknown>;
};

describe("ActionText::AttachableTest", () => {
  fixturesAll();

  it.skip("as_json is a hash when the attachable is persisted", () => {});

  it.skip("as_json is a hash when the attachable is a new record", () => {});

  it("attachable_sgid is included in as_json when only option is nil or includes attachable_sgid", async () => {
    const attachable = await (
      ActiveStorage.Blob as unknown as {
        createAfterUnfurlingBang(options: object): Promise<AttachableBlob>;
      }
    ).createAfterUnfurlingBang({
      io: new StringIO("test"),
      filename: "test.txt",
      key: 123,
    });

    expect(attachable.asJson({ only: "id" })).toEqual({ id: attachable.id });
    expect(attachable.asJson({ only: ["id"] })).toEqual({ id: attachable.id });
    const { attachable_sgid: _, ...withoutSgid } = attachable.asJson();
    expect(attachable.asJson({ except: "attachable_sgid" })).toEqual(withoutSgid);
    expect(attachable.asJson({ except: ["attachable_sgid"] })).toEqual(withoutSgid);
  });
});
