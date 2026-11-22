import { describe, expectTypeOf, it } from "vitest";
import type { Attachment } from "../../lib/attachment.js";
import type { One } from "../../lib/attached/one.js";
import type { Blob } from "../../lib/blob.js";

describe("Attached::One types", () => {
  it("answers the members delegate_missing_to forwards to the attachment", () => {
    expectTypeOf<One["variant"]>().toEqualTypeOf<Attachment["variant"] | undefined>();
    expectTypeOf<One["blob"]>().toEqualTypeOf<Attachment["blob"] | undefined>();
    expectTypeOf<One["url"]>().toEqualTypeOf<Blob["url"] | undefined>();
  });

  it("keeps its own members' signatures", () => {
    expectTypeOf<One["purge"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<One["purgeLater"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<One["isBlank"]>().toEqualTypeOf<() => boolean>();
    expectTypeOf<One["isAttached"]>().toEqualTypeOf<() => boolean>();
    expectTypeOf<One["attach"]>().returns.toEqualTypeOf<Promise<One | null>>();
    expectTypeOf<One["name"]>().toEqualTypeOf<string>();
  });
});
