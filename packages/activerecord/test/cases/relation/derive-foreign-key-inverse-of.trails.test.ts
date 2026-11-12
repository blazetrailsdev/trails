import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import "../../../lib/index.js";
import { fixtures } from "../../support/use-fixtures.js";
import { Human } from "../../models/human.js";
import { Face } from "../../models/face.js";
import { Interest } from "../../models/interest.js";
import { Book } from "../../models/book.js";
import { Citation } from "../../models/citation.js";

constSet(TopLevel, "Human", Human);
constSet(TopLevel, "Face", Face);
constSet(TopLevel, "Interest", Interest);
constSet(TopLevel, "Book", Book);
constSet(TopLevel, "Citation", Citation);

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
