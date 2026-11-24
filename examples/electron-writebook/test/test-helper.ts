import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.ts");
await import("@blazetrails/trailties/test-help");

const { Base } = await import("@blazetrails/activerecord");
const pool = Base.connectionPool();
await pool.schemaReflection.loadAllBang(pool);

const { Access } = await import("../app/models/access.ts");
const { Account } = await import("../app/models/account.ts");
const { Book } = await import("../app/models/book.ts");
const { Edit } = await import("../app/models/edit.ts");
const { Leaf } = await import("../app/models/leaf.ts");
const { Page } = await import("../app/models/page.ts");
const { Picture } = await import("../app/models/picture.ts");
const { Section } = await import("../app/models/section.ts");
const { Session } = await import("../app/models/session.ts");
const { User } = await import("../app/models/user.ts");
const { Markdown } = await import("../lib/trails-ext/action-text-markdown.ts");

/** Empties the app's tables, children first, so each test starts from a blank database. */
export async function resetDatabase(): Promise<void> {
  for (const model of [
    Edit,
    Markdown,
    Leaf,
    Page,
    Picture,
    Section,
    Access,
    Session,
    Book,
    User,
    Account,
  ]) {
    await (model as typeof Base).deleteAll();
  }
  await (await Base.leaseConnection()).execute("delete from leaf_search_index");
}

const { FixtureSet } = await import("@blazetrails/activerecord/fixtures.js");
const { fileURLToPath } = await import("node:url");

const FIXTURES = fileURLToPath(new URL("fixtures", import.meta.url));
const FIXTURE_SETS = [
  "accounts",
  "users",
  "books",
  "accesses",
  "sections",
  "pages",
  "pictures",
  "leaves",
  "action_text/markdowns",
];

/** Writebook's `fixtures :all`, loaded onto a blank database. */
export async function loadFixtures(): Promise<void> {
  await resetDatabase();
  FixtureSet.resetCache();
  await FixtureSet.createFixtures(FIXTURES, FIXTURE_SETS);
}

const FIXTURE_CLASSES = {
  accounts: Account,
  users: User,
  books: Book,
  accesses: Access,
  sections: Section,
  pages: Page,
  pictures: Picture,
  leaves: Leaf,
};

/** The record a fixture label names, as Rails' `books(:handbook)` reads it. */
export async function fixture<T>(set: keyof typeof FIXTURE_CLASSES, label: string): Promise<T> {
  return (await (FIXTURE_CLASSES[set] as unknown as typeof Base).find(
    FixtureSet.identify(label),
  )) as T;
}

const { IntegrationTest } = await import("@blazetrails/actionpack/testing");
const { ActionDispatch } = await import("@blazetrails/actionpack");

/**
 * `app` is overridden because `IntegrationTest#app` recurses without it (story
 * integration-test-app-recurses-without-override).
 */
export class ApplicationIntegrationTest extends IntegrationTest {
  override get app() {
    return ActionDispatch.testApp as never;
  }

  /** Runs the first-run setup and signs in as the administrator it creates. */
  async firstRun(): Promise<void> {
    await this.post("/first_run", {
      params: { user: { name: "Ada", email_address: "ada@example.com", password: "secret123456" } },
    });
  }
}
