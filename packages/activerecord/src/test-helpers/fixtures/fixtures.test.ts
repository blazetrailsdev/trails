import { describe, it, expect, vi } from "vitest";
import type { DatabaseAdapter } from "../../adapter.js";
import { defineFixtures, fixtureId, isFixtureRef, type FixtureRef } from "../define-fixtures.js";
import { topicFixtureData } from "./topics.js";
import { postFixtureData } from "./posts.js";
import { commentFixtureData } from "./comments.js";
import { authorFixtureData } from "./authors.js";
import { bookFixtureData } from "./books.js";
import { authorAddressFixtureData } from "./author-addresses.js";
import { companyFixtureData } from "./companies.js";
import { accountFixtureData } from "./accounts.js";

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

function seedRows(
  Model: ReturnType<typeof makeModel>,
  label: string,
  extra: Record<string, unknown> = {},
) {
  const id = fixtureId(label);
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
      type: "Topic",
    });
  });

  it("second fixture has Mary as author and a cross-ref to first", () => {
    expect(topicFixtureData.second.author_name).toBe("Mary");
    const parentRef = topicFixtureData.second.parent_id as FixtureRef;
    expect(isFixtureRef(parentRef)).toBe(true);
    expect(parentRef.fixtureName).toBe("first");
    expect(parentRef.tableName).toBe("topics");
  });

  it("defineFixtures resolves cross-refs: second.parent_id equals fixtureId(first)", async () => {
    const adapter = makeAdapter();
    const Topic = makeModel("topics");
    for (const k of Object.keys(topicFixtureData) as Array<keyof typeof topicFixtureData>) {
      seedRows(Topic, k, { title: topicFixtureData[k].title });
    }

    const topics = await defineFixtures(adapter, Topic, topicFixtureData);
    expect(topics.first).toBeTruthy();
    expect(topics.second).toBeTruthy();

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("topics"));
    const secondInsert = insertSqls.find((s) => s.includes(String(fixtureId("second"))));
    expect(secondInsert).toBeTruthy();
    expect(secondInsert).toContain(String(fixtureId("first")));
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

  it("does_it_hurt is a SpecialComment on sti_comments post", () => {
    expect(commentFixtureData.does_it_hurt.type).toBe("SpecialComment");
    const postRef = commentFixtureData.does_it_hurt.post_id as FixtureRef;
    expect(isFixtureRef(postRef)).toBe(true);
    expect(postRef.fixtureName).toBe("thinking");
  });

  it("defineFixtures resolves comment→post cross-ref correctly", async () => {
    const adapter = makeAdapter();
    const Comment = makeModel("comments");
    for (const k of Object.keys(commentFixtureData) as Array<keyof typeof commentFixtureData>) {
      seedRows(Comment, k);
    }

    await defineFixtures(adapter, Comment, commentFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("comments"));
    const greetingsInsert = insertSqls.find((s) => s.includes(String(fixtureId("greetings"))));
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
      seedRows(Author, k, { name: authorFixtureData[k].name });
    }

    await defineFixtures(adapter, Author, authorFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("authors"));
    const davidInsert = insertSqls.find((s) => s.includes(String(fixtureId("david"))));
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
      seedRows(Book, k, { name: bookFixtureData[k].name });
    }

    await defineFixtures(adapter, Book, bookFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("books"));
    const awdrInsert = insertSqls.find((s) => s.includes(String(fixtureId("awdr"))));
    expect(awdrInsert).toBeTruthy();
    expect(awdrInsert).toContain(String(fixtureId("david")));
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
      seedRows(Company, k, { name: (companyFixtureData[k] as any).name });
    }

    await defineFixtures(adapter, Company, companyFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("companies"));
    const clientInsert = insertSqls.find((s) => s.includes(String(fixtureId("first_client"))));
    expect(clientInsert).toBeTruthy();
    expect(clientInsert).toContain(String(fixtureId("first_firm")));
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

  it("defineFixtures resolves signals37.firm_id to first_firm id", async () => {
    const adapter = makeAdapter();
    const Account = makeModel("accounts");
    for (const k of Object.keys(accountFixtureData) as Array<keyof typeof accountFixtureData>) {
      seedRows(Account, k, { credit_limit: (accountFixtureData[k] as any).credit_limit });
    }

    await defineFixtures(adapter, Account, accountFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("accounts"));
    const signals37Insert = insertSqls.find((s) => s.includes(String(fixtureId("signals37"))));
    expect(signals37Insert).toBeTruthy();
    expect(signals37Insert).toContain(String(fixtureId("first_firm")));
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

  it("address fixtures are empty objects (PK-only rows)", () => {
    expect(authorAddressFixtureData.david_address).toEqual({});
    expect(authorAddressFixtureData.mary_address).toEqual({});
  });
});
