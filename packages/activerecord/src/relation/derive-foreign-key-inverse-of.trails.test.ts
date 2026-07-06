/**
 * trails-internal coverage (not a Rails test port) for the `inverse_of`
 * foreign-key derivation branches in `Relation#_deriveForeignKey`
 * (`relation.ts`), a port of Rails' `Reflection#foreign_key` /
 * `#derive_foreign_key` (reflection.rb:551-566, 812-816). When a has_one /
 * has_many sets `inverse_of:` (and carries neither an explicit `foreignKey`
 * nor a polymorphic `as`), derivation recurses into the inverse reflection so
 * the join uses the inverse's own foreign key rather than the owner-name
 * default `#{owner}_id`. These cases exercise the branches PR #4644 added but
 * left uncovered (flagged on its round-2 review).
 *
 * Reachable via canonical models, asserted below:
 *   - className-absent fallback, plural (`_singularize(name)` → camelize) and
 *     singular (`name` → camelize) forms;
 *   - explicitly-keyed inverse: the inverse belongs_to's `foreignKey` scalar
 *     returned verbatim from the recursion, distinct from the owner default.
 *
 * NOT reachable via any canonical shape (documented, not tested):
 *   - a *polymorphic inverse* (recursion landing on an inverse whose
 *     `options.as` yields `#{as}_id`). The recursion is only entered when the
 *     OUTER reflection has no `as` (the `if (options.as)` guard returns first),
 *     and the reflection it recurses INTO is the outer's `inverse_of` target.
 *     Only a has_one/has_many polymorphic reflection carries `as`, and its
 *     inverse is always a polymorphic `belongs_to` (which carries
 *     `polymorphic: true`, not `as`) — no canonical has_one/has_many names
 *     another has-side polymorphic reflection as its `inverse_of`, so an
 *     `as`-bearing reflection is never the thing recursed into;
 *   - a *composite* (`string[]`) inverse foreign key: every canonical
 *     collection whose inverse is composite already declares its own explicit
 *     `foreignKey`, short-circuiting before the recursion. The scalar case
 *     below covers the same "return the inverse's key verbatim" line.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Human } from "../test-helpers/models/human.js";
import { Face } from "../test-helpers/models/face.js";
import { Interest } from "../test-helpers/models/interest.js";
import { Book } from "../test-helpers/models/book.js";
import { Citation } from "../test-helpers/models/citation.js";

registerModel(Human);
registerModel(Face);
registerModel(Interest);
registerModel(Book);
registerModel(Citation);

describe("_deriveForeignKey inverse_of branches", () => {
  fixtures(["humans", "books"]);

  // has_many :interests, inverse_of: :human — no className. The className-absent
  // fallback singularizes ("interests" → "Interest"), then the inverse
  // belongs_to :human derives `human_id`.
  it("has_many inverse_of, no className (plural fallback) derives the inverse FK", () => {
    const sql = Human.joins("interests").toSql();
    expect(sql).toContain(`"interests"."human_id" = "humans"."id"`);
  });

  // has_one :face, inverse_of: :human — no className. The className-absent
  // fallback camelizes the name as-is ("face" → "Face"); the inverse
  // belongs_to :human derives `human_id`.
  it("has_one inverse_of, no className (singular fallback) derives the inverse FK", () => {
    const sql = Human.joins("face").toSql();
    expect(sql).toContain(`"faces"."human_id" = "humans"."id"`);
  });

  // has_many :citations, inverse_of: :book — no className, no foreignKey. The
  // inverse belongs_to :book declares foreignKey: "book1_id", so derivation
  // returns "book1_id" verbatim — NOT the owner-name default "book_id".
  it("uses the inverse belongs_to's explicit foreignKey, not the owner default", () => {
    const sql = Book.joins("citations").toSql();
    expect(sql).toContain(`"citations"."book1_id" = "books"."id"`);
    expect(sql).not.toContain(`"book_id"`);
  });
});
