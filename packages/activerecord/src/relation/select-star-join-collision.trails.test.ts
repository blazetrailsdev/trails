import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Person } from "../test-helpers/models/person.js";
import { Friendship } from "../test-helpers/models/friendship.js";
import { quoteTableName, escapeRegExp } from "../support/quote-regex.js";

registerModel(Friendship);

describe("SELECT * column collision in joined relations", () => {
  const { people } = fixtures(["people", "friendships"]);

  it("hydrates the target's columns, not the join table's, when ids collide", async () => {
    const michael = people("michael");
    const followers = await michael.followers;
    expect(followers.map((p) => ({ id: p.id, first_name: p.first_name }))).toEqual([
      { id: people("david").id, first_name: "David" },
    ]);
  });

  it("default projection is `<target>.*` always (matches Rails — never bare `*`)", () => {
    const qPeople = escapeRegExp(quoteTableName("people"));
    const noJoins = Person.all().toSql();
    expect(noJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
    expect(noJoins).not.toMatch(/SELECT\s+\*/i);

    const withJoins = Person.all().joins("INNER JOIN friendships ON 1 = 1").toSql();
    expect(withJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
  });

  it("keeps qualified projection even when from() replaces the FROM source (Rails behavior)", () => {
    const sql = Person.all().from("(SELECT * FROM people) AS sub").toSql();
    expect(sql).toMatch(
      new RegExp(`SELECT\\s+${escapeRegExp(quoteTableName("people"))}\\.\\*`, "i"),
    );
  });
});
