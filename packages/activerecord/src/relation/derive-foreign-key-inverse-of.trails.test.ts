import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
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

const unquoted = (sql: string): string => sql.replace(/["`]/g, "");

describe("_deriveForeignKey inverse_of branches", () => {
  fixtures(["humans", "books"]);

  it("has_many inverse_of, no className (plural fallback) derives the inverse FK", () => {
    const sql = unquoted(Human.joins(":interests").toSql());
    expect(sql).toContain("interests.human_id = humans.id");
  });

  it("has_one inverse_of, no className (singular fallback) derives the inverse FK", () => {
    const sql = unquoted(Human.joins(":face").toSql());
    expect(sql).toContain("faces.human_id = humans.id");
  });

  it("uses the inverse belongs_to's explicit foreignKey, not the owner default", () => {
    const sql = unquoted(Book.joins(":citations").toSql());
    expect(sql).toContain("citations.book1_id = books.id");
    expect(sql).not.toContain("citations.book_id");
  });
});
