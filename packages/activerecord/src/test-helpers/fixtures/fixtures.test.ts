import { describe, it, expect, vi } from "vitest";
import type { DatabaseAdapter } from "../../adapter.js";
import { defineFixtures, fixtureId, isFixtureRef, type FixtureRef } from "../define-fixtures.js";
import { adminAccountsFixtureData } from "./admin/accounts.js";
import { adminUsersFixtureData } from "./admin/users.js";
import { adminRandomlyNamedA9FixtureData } from "./admin/randomly-named-a9.js";
import { adminRandomlyNamedB0FixtureData } from "./admin/randomly-named-b0.js";
import { topicFixtureData } from "./topics.js";
import { postFixtureData } from "./posts.js";
import { commentFixtureData } from "./comments.js";
import { authorFixtureData } from "./authors.js";
import { bookFixtureData } from "./books.js";
import { authorAddressFixtureData } from "./author-addresses.js";
import { companyFixtureData } from "./companies.js";
import { accountFixtureData } from "./accounts.js";
import { developerFixtureData } from "./developers.js";
import { projectFixtureData } from "./projects.js";
import { developersProjectsFixtureData } from "./developers-projects.js";

function makeAdapter(): DatabaseAdapter {
  return {
    adapterName: "sqlite" as const,
    execute: vi.fn(async () => []),
    executeMutation: vi.fn(async () => 0),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    isNoDatabaseError: () => false,
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
  } as unknown as DatabaseAdapter;
}

function makeModel(tableName: string, pk = "id") {
  const rows = new Map<unknown, Record<string, unknown>>();
  const Model = {
    tableName,
    primaryKey: pk,
    findBy: vi.fn(async (attrs: Record<string, unknown>) => {
      const val = attrs[pk];
      return rows.get(val) ?? null;
    }),
    _rows: rows,
  } as any;
  return Model;
}

function idOf(data: Record<string, { id?: number }>, label: string): number {
  return data[label]?.id ?? fixtureId(label);
}

/**
 * Find the INSERT statement whose VALUES tuple starts with the given primary key.
 * Anchoring on the leading `VALUES (<id>` slot avoids false positives from small
 * integer ids appearing elsewhere in the SQL (counts, dates, other FKs).
 */
function findInsertWithPk(sqls: string[], pk: number): string | undefined {
  const re = new RegExp(`VALUES\\s*\\(\\s*${pk}\\b`);
  return sqls.find((s) => re.test(s));
}

/**
 * Assert that the row's VALUES tuple carries `fkId` as one of the column values.
 * Word-boundary match prevents small integer ids from matching as substrings of
 * unrelated values (counts, dates, etc.). Use after `findInsertWithPk` has
 * narrowed the SQL to the specific row we care about.
 */
function expectValueInRow(sql: string | undefined, fkId: number): void {
  expect(sql).toBeTruthy();
  const valuesMatch = /VALUES\s*\(([^)]*)\)/.exec(sql ?? "");
  const tuple = valuesMatch?.[1] ?? "";
  const vals = tuple.split(",").map((v) => v.trim());
  expect(vals).toContain(String(fkId));
}

function seedRows(
  Model: ReturnType<typeof makeModel>,
  label: string,
  data: Record<string, { id?: number }>,
  extra: Record<string, unknown> = {},
) {
  const id = idOf(data, label);
  Model._rows.set(id, { id, ...extra });
}

describe("topicFixtureData", () => {
  it("exports five fixtures with correct keys", () => {
    const keys = Object.keys(topicFixtureData);
    expect(keys).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  it("first fixture has expected data", () => {
    expect(topicFixtureData.first).toMatchObject({
      title: "The First Topic",
      author_name: "David",
      approved: false,
      replies_count: 1,
    });
    // `first` is an STI base Topic — Rails omits `type:` (NULL discriminator).
    expect("type" in topicFixtureData.first).toBe(false);
  });

  it("second fixture has Mary as author and a cross-ref to first", () => {
    expect(topicFixtureData.second.author_name).toBe("Mary");
    const parentRef = topicFixtureData.second.parent_id as FixtureRef;
    expect(isFixtureRef(parentRef)).toBe(true);
    expect(parentRef.fixtureName).toBe("first");
    expect(parentRef.tableName).toBe("topics");
  });

  it("defineFixtures resolves cross-refs: second.parent_id equals first's declared id", async () => {
    const adapter = makeAdapter();
    const Topic = makeModel("topics");
    for (const k of Object.keys(topicFixtureData) as Array<keyof typeof topicFixtureData>) {
      seedRows(Topic, k, topicFixtureData, { title: topicFixtureData[k].title });
    }

    const topics = await defineFixtures(adapter, Topic, topicFixtureData);
    expect(topics.first).toBeTruthy();
    expect(topics.second).toBeTruthy();

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("topics"));
    const secondInsert = findInsertWithPk(insertSqls, topicFixtureData.second.id);
    expect(secondInsert).toBeTruthy();
    expectValueInRow(secondInsert, topicFixtureData.first.id);
  });
});

describe("postFixtureData", () => {
  it("exports welcome and thinking posts", () => {
    expect(postFixtureData.welcome.title).toBe("Welcome to the weblog");
    expect(postFixtureData.thinking.title).toBe("So I was thinking");
  });

  it("posts reference authors table via ref()", () => {
    const authorRef = postFixtureData.welcome.author_id as FixtureRef;
    expect(isFixtureRef(authorRef)).toBe(true);
    expect(authorRef.tableName).toBe("authors");
  });
});

describe("commentFixtureData", () => {
  it("greetings comment references welcome post via ref()", () => {
    expect(commentFixtureData.greetings.body).toBe("Thank you for the welcome");
    const postRef = commentFixtureData.greetings.post_id as FixtureRef;
    expect(isFixtureRef(postRef)).toBe(true);
    expect(postRef.fixtureName).toBe("welcome");
    expect(postRef.tableName).toBe("posts");
  });

  it("does_it_hurt is a SpecialComment on thinking post", () => {
    expect(commentFixtureData.does_it_hurt.type).toBe("SpecialComment");
    const postRef = commentFixtureData.does_it_hurt.post_id as FixtureRef;
    expect(isFixtureRef(postRef)).toBe(true);
    expect(postRef.fixtureName).toBe("thinking");
  });

  it("defineFixtures resolves comment→post cross-ref correctly", async () => {
    const adapter = makeAdapter();
    const Comment = makeModel("comments");
    for (const k of Object.keys(commentFixtureData) as Array<keyof typeof commentFixtureData>) {
      seedRows(Comment, k, commentFixtureData);
    }

    await defineFixtures(adapter, Comment, commentFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("comments"));
    const greetingsInsert = findInsertWithPk(insertSqls, commentFixtureData.greetings.id);
    expect(greetingsInsert).toBeTruthy();
    expect(greetingsInsert).toContain(String(fixtureId("welcome")));
  });
});

describe("authorFixtureData", () => {
  it("exports david, mary, bob", () => {
    expect(Object.keys(authorFixtureData)).toEqual(["david", "mary", "bob"]);
  });

  it("david has correct name and cross-refs to author_addresses", () => {
    expect(authorFixtureData.david.name).toBe("David");
    const addrRef = authorFixtureData.david.author_address_id as FixtureRef;
    expect(isFixtureRef(addrRef)).toBe(true);
    expect(addrRef.tableName).toBe("author_addresses");
    expect(addrRef.fixtureName).toBe("david_address");
  });

  it("mary refs mary_address", () => {
    const addrRef = authorFixtureData.mary.author_address_id as FixtureRef;
    expect(isFixtureRef(addrRef)).toBe(true);
    expect(addrRef.fixtureName).toBe("mary_address");
  });

  it("defineFixtures resolves author→address cross-ref", async () => {
    const adapter = makeAdapter();
    const Author = makeModel("authors");
    for (const k of Object.keys(authorFixtureData) as Array<keyof typeof authorFixtureData>) {
      seedRows(Author, k, authorFixtureData, { name: authorFixtureData[k].name });
    }

    await defineFixtures(adapter, Author, authorFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("authors"));
    const davidInsert = findInsertWithPk(insertSqls, authorFixtureData.david.id);
    expect(davidInsert).toBeTruthy();
    expect(davidInsert).toContain(String(fixtureId("david_address")));
  });
});

describe("bookFixtureData", () => {
  it("exports awdr, rfr, ddd, tlg", () => {
    expect(Object.keys(bookFixtureData)).toEqual(["awdr", "rfr", "ddd", "tlg"]);
  });

  it("awdr has correct name and format", () => {
    expect(bookFixtureData.awdr.name).toBe("Agile Web Development with Rails");
    expect(bookFixtureData.awdr.format).toBe("paperback");
  });

  it("rfr refs authors via ref()", () => {
    const authorRef = bookFixtureData.rfr.author_id as FixtureRef;
    expect(isFixtureRef(authorRef)).toBe(true);
    expect(authorRef.tableName).toBe("authors");
    expect(authorRef.fixtureName).toBe("david");
  });

  it("defineFixtures resolves book→author cross-ref", async () => {
    const adapter = makeAdapter();
    const Book = makeModel("books");
    for (const k of Object.keys(bookFixtureData) as Array<keyof typeof bookFixtureData>) {
      seedRows(Book, k, bookFixtureData, { name: bookFixtureData[k].name });
    }

    await defineFixtures(adapter, Book, bookFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("books"));
    const awdrInsert = findInsertWithPk(insertSqls, bookFixtureData.awdr.id);
    expect(awdrInsert).toBeTruthy();
    expect(awdrInsert).toContain(String(fixtureId("david")));
  });

  it("ref() resolves cross-table to declared id once target fixture set is loaded", async () => {
    // Load authors first so the (authors, david) → id=1 entry lands in the
    // adapter-scoped declared-id registry; then loading books must resolve
    // books.awdr.author_id to authorFixtureData.david.id, NOT fixtureId("david").
    const adapter = makeAdapter();
    const Author = makeModel("authors");
    const Book = makeModel("books");
    for (const k of Object.keys(authorFixtureData) as Array<keyof typeof authorFixtureData>) {
      seedRows(Author, k, authorFixtureData, { name: authorFixtureData[k].name });
    }
    for (const k of Object.keys(bookFixtureData) as Array<keyof typeof bookFixtureData>) {
      seedRows(Book, k, bookFixtureData, { name: bookFixtureData[k].name });
    }

    await defineFixtures(adapter, Author, authorFixtureData);
    await defineFixtures(adapter, Book, bookFixtureData);

    const bookInserts = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("books"));
    const awdrInsert = findInsertWithPk(bookInserts, bookFixtureData.awdr.id);
    expect(awdrInsert).toBeTruthy();
    expectValueInRow(awdrInsert, authorFixtureData.david.id);
    expect(authorFixtureData.david.id).not.toBe(fixtureId("david"));
  });
});

describe("companyFixtureData", () => {
  it("exports all 12 Rails companies fixtures", () => {
    expect(Object.keys(companyFixtureData)).toEqual([
      "first_firm",
      "first_client",
      "second_client",
      "another_firm",
      "another_client",
      "a_third_client",
      "rails_core",
      "leetsoft",
      "jadedpixel",
      "odegy",
      "another_first_firm_client",
      "recursive_association_fk",
    ]);
  });

  it("first_firm is a Firm with STI type column", () => {
    expect(companyFixtureData.first_firm.type).toBe("Firm");
    expect(companyFixtureData.first_firm.name).toBe("37signals");
  });

  it("first_client is a Client with firm_id cross-ref to first_firm and self-ref client_of", () => {
    expect(companyFixtureData.first_client.type).toBe("Client");
    const firmRef = companyFixtureData.first_client.firm_id as FixtureRef;
    expect(isFixtureRef(firmRef)).toBe(true);
    expect(firmRef.tableName).toBe("companies");
    expect(firmRef.fixtureName).toBe("first_firm");
    // client_of: 2 in Rails YAML — first_client's own ID (self-ref; ref() is just ID math)
    const clientOfRef = companyFixtureData.first_client.client_of as FixtureRef;
    expect(isFixtureRef(clientOfRef)).toBe(true);
    expect(clientOfRef.fixtureName).toBe("first_client");
  });

  it("rails_core is a DependentFirm", () => {
    expect(companyFixtureData.rails_core.type).toBe("DependentFirm");
  });

  it("leetsoft has no type (falls back to Company base)", () => {
    expect((companyFixtureData.leetsoft as any).type).toBeUndefined();
    const clientOfRef = companyFixtureData.leetsoft.client_of as FixtureRef;
    expect(isFixtureRef(clientOfRef)).toBe(true);
    expect(clientOfRef.fixtureName).toBe("rails_core");
  });

  it("odegy is an ExclusivelyDependentFirm", () => {
    expect(companyFixtureData.odegy.type).toBe("ExclusivelyDependentFirm");
  });

  it("defineFixtures resolves first_client.firm_id to first_firm id", async () => {
    const adapter = makeAdapter();
    const Company = makeModel("companies");
    for (const k of Object.keys(companyFixtureData) as Array<keyof typeof companyFixtureData>) {
      seedRows(Company, k, companyFixtureData, { name: (companyFixtureData[k] as any).name });
    }

    await defineFixtures(adapter, Company, companyFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("companies"));
    const clientInsert = findInsertWithPk(insertSqls, companyFixtureData.first_client.id);
    expect(clientInsert).toBeTruthy();
    expectValueInRow(clientInsert, companyFixtureData.first_firm.id);
  });
});

describe("accountFixtureData", () => {
  it("exports all 6 Rails accounts fixtures", () => {
    expect(Object.keys(accountFixtureData)).toEqual([
      "signals37",
      "unknown",
      "rails_core_account",
      "last_account",
      "rails_core_account_2",
      "odegy_account",
    ]);
  });

  it("signals37 has firm_id cross-ref to first_firm and correct credit_limit", () => {
    expect(accountFixtureData.signals37.credit_limit).toBe(50);
    const firmRef = accountFixtureData.signals37.firm_id as FixtureRef;
    expect(isFixtureRef(firmRef)).toBe(true);
    expect(firmRef.tableName).toBe("companies");
    expect(firmRef.fixtureName).toBe("first_firm");
  });

  it("unknown has no firm_id", () => {
    expect((accountFixtureData.unknown as any).firm_id).toBeUndefined();
    expect(accountFixtureData.unknown.credit_limit).toBe(50);
  });

  it("odegy_account references odegy company", () => {
    const firmRef = accountFixtureData.odegy_account.firm_id as FixtureRef;
    expect(isFixtureRef(firmRef)).toBe(true);
    expect(firmRef.fixtureName).toBe("odegy");
  });

  it("defineFixtures: signals37.firm_id falls back to fixtureId('first_firm') when companies set isn't loaded", async () => {
    const adapter = makeAdapter();
    const Account = makeModel("accounts");
    for (const k of Object.keys(accountFixtureData) as Array<keyof typeof accountFixtureData>) {
      seedRows(Account, k, accountFixtureData, {
        credit_limit: (accountFixtureData[k] as any).credit_limit,
      });
    }

    await defineFixtures(adapter, Account, accountFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("accounts"));
    const signals37Insert = findInsertWithPk(insertSqls, accountFixtureData.signals37.id);
    expect(signals37Insert).toBeTruthy();
    // companies fixture set isn't loaded in this test, so ref("companies", "first_firm")
    // falls back to fixtureId("first_firm") (no entry in declared-id registry).
    expect(signals37Insert).toContain(String(fixtureId("first_firm")));
  });
});

describe("developerFixtureData", () => {
  it("exports david, jamis, dev_3..dev_10, poor_jamis", () => {
    const keys = Object.keys(developerFixtureData);
    expect(keys).toContain("david");
    expect(keys).toContain("jamis");
    expect(keys).toContain("poor_jamis");
    expect(keys.filter((k) => k.startsWith("dev_"))).toHaveLength(8);
  });

  it("david has correct name and salary", () => {
    expect(developerFixtureData.david.name).toBe("David");
    expect(developerFixtureData.david.salary).toBe(80000);
  });

  it("jamis has high salary, poor_jamis has low salary", () => {
    expect(developerFixtureData.jamis.salary).toBe(150000);
    expect(developerFixtureData.poor_jamis.salary).toBe(9000);
  });

  it("defineFixtures inserts david", async () => {
    const adapter = makeAdapter();
    const Developer = makeModel("developers");
    for (const k of Object.keys(developerFixtureData) as Array<keyof typeof developerFixtureData>) {
      seedRows(Developer, k, developerFixtureData, { name: developerFixtureData[k].name });
    }
    await defineFixtures(adapter, Developer, developerFixtureData);
    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("developers"));
    expect(findInsertWithPk(insertSqls, developerFixtureData.david.id)).toBeTruthy();
  });
});

describe("projectFixtureData", () => {
  it("exports active_record and action_controller", () => {
    expect(Object.keys(projectFixtureData)).toEqual(["active_record", "action_controller"]);
  });

  it("active_record has correct name", () => {
    expect(projectFixtureData.active_record.name).toBe("Active Record");
  });
});

describe("developersProjectsFixtureData", () => {
  it("exports four join rows", () => {
    expect(Object.keys(developersProjectsFixtureData)).toHaveLength(4);
  });

  it("david_active_record refs david in developers and active_record in projects", () => {
    const devRef = developersProjectsFixtureData.david_active_record.developer_id as FixtureRef;
    const projRef = developersProjectsFixtureData.david_active_record.project_id as FixtureRef;
    expect(isFixtureRef(devRef)).toBe(true);
    expect(devRef.tableName).toBe("developers");
    expect(devRef.fixtureName).toBe("david");
    expect(isFixtureRef(projRef)).toBe(true);
    expect(projRef.tableName).toBe("projects");
    expect(projRef.fixtureName).toBe("active_record");
  });
});

describe("authorAddressFixtureData", () => {
  it("exports david_address, david_address_extra, mary_address, bob_address", () => {
    expect(Object.keys(authorAddressFixtureData)).toEqual([
      "david_address",
      "david_address_extra",
      "mary_address",
      "bob_address",
    ]);
  });

  it("address fixtures are PK-only rows mirroring Rails ids", () => {
    expect(authorAddressFixtureData.david_address).toEqual({ id: 1 });
    expect(authorAddressFixtureData.mary_address).toEqual({ id: 3 });
  });
});

describe("admin/accounts (slash-keyed subdir fixture)", () => {
  it("exports signals37 with correct name", () => {
    expect(Object.keys(adminAccountsFixtureData)).toEqual(["signals37"]);
    expect(adminAccountsFixtureData.signals37.name).toBe("37signals");
  });
});

describe("admin/users (slash-keyed subdir fixture)", () => {
  it("exports david and jamis", () => {
    expect(Object.keys(adminUsersFixtureData)).toEqual(["david", "jamis"]);
  });

  it("david has correct name and account_id ref to admin_accounts", () => {
    expect(adminUsersFixtureData.david.name).toBe("David");
    const acctRef = adminUsersFixtureData.david.account_id as FixtureRef;
    expect(isFixtureRef(acctRef)).toBe(true);
    expect(acctRef.tableName).toBe("admin_accounts");
    expect(acctRef.fixtureName).toBe("signals37");
  });

  it("jamis has settings with symbol key and account_id ref", () => {
    expect(adminUsersFixtureData.jamis.name).toBe("Jamis");
    const acctRef = adminUsersFixtureData.jamis.account_id as FixtureRef;
    expect(isFixtureRef(acctRef)).toBe(true);
    expect(acctRef.fixtureName).toBe("signals37");
    expect((adminUsersFixtureData.jamis.settings as Record<string, string>)[":symbol"]).toBe(
      "symbol",
    );
  });
});

describe("admin/randomlyNamedA9 (slash-keyed subdir fixture)", () => {
  it("exports first_instance and second_instance", () => {
    expect(Object.keys(adminRandomlyNamedA9FixtureData)).toEqual([
      "first_instance",
      "second_instance",
    ]);
  });

  it("rows have correct attribute values", () => {
    expect(adminRandomlyNamedA9FixtureData.first_instance.some_attribute).toBe("AAA");
    expect(adminRandomlyNamedA9FixtureData.first_instance.another_attribute).toBe(0);
    expect(adminRandomlyNamedA9FixtureData.second_instance.some_attribute).toBe("BBB");
    expect(adminRandomlyNamedA9FixtureData.second_instance.another_attribute).toBe(999);
  });
});

describe("admin/randomlyNamedB0 (slash-keyed subdir fixture)", () => {
  it("exports first_instance and second_instance", () => {
    expect(Object.keys(adminRandomlyNamedB0FixtureData)).toEqual([
      "first_instance",
      "second_instance",
    ]);
  });

  it("rows have correct attribute values mirroring B0 table (randomly_named_table3)", () => {
    expect(adminRandomlyNamedB0FixtureData.first_instance.some_attribute).toBe("AAA");
    expect(adminRandomlyNamedB0FixtureData.second_instance.another_attribute).toBe(999);
  });
});
