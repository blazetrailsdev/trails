import { describe, expectTypeOf, it } from "vitest";
import type { Attachment } from "../../lib/attachment.js";
import type { One } from "../../lib/attached/one.js";
import type { Blob } from "../../lib/blob.js";

describe("Attached::One types", () => {
  it("answers the members delegate_missing_to forwards to the attachment", () => {
    expectTypeOf<One["variant"]>().toEqualTypeOf<Attachment["variant"]>();
    expectTypeOf<One["blob"]>().toEqualTypeOf<Attachment["blob"]>();
    expectTypeOf<One["url"]>().toEqualTypeOf<Blob["url"]>();
  });
});
