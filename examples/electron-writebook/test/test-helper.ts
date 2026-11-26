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
// Writebook's test/fixtures/files/pixel.bmp, a 1x1 bitmap, kept inline because the
// control-byte check refuses a raw .bmp outside its binary allowlist.
export const PIXEL_BMP = Buffer.from(
  "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAA==",
  "base64",
);

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
const { Trails: TrailsApp } = await import("@blazetrails/trailties");
const { File: FixtureFile } = await import("@blazetrails/activerecord/fixture-set/file.js");
const { FixtureSet: ActiveStorageFixtureSet } =
  await import("@blazetrails/activestorage/testing/fixture-set");
const { fileURLToPath } = await import("node:url");

const FIXTURES = fileURLToPath(new URL("fixtures", import.meta.url));
// The `active_support_test_case` load hook seats this in Rails
// (activestorage/lib/active_storage/engine.rb); vitest runs no TestCase load.
ActiveStorageFixtureSet.fileFixturePath = `${FIXTURES}/files`;
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
  "active_storage/blobs",
  "active_storage/attachments",
];

/** Writebook's `fixtures :all`, loaded onto a blank database. */
export async function loadFixtures(): Promise<void> {
  await resetDatabase();
  FixtureSet.resetCache();
  FixtureFile.registerModule(`${FIXTURES}/active_storage/blobs.ts`, {
    handbook_reading_image_blob: JSON.parse(
      await ActiveStorageFixtureSet.blob({ filename: "reading.webp", service_name: "test" }),
    ),
  });
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

/** Writebook's `leafable_path(leaf)` direct route: the leafable's resource under its book, by the leaf's id. */
export function leafablePath(leaf: {
  book_id: unknown;
  id: unknown;
  leafable_type: string;
}): string {
  return `/books/${leaf.book_id}/${leaf.leafable_type.toLowerCase()}s/${leaf.id}`;
}

/** The application's route helpers, as `Rails.application.routes.url_helpers` (`trailsBlobPath` &c.). */
export function urlHelpers(): Record<string, (...args: unknown[]) => string> {
  return TrailsApp.application.routes().urlHelpers() as unknown as Record<
    string,
    (...args: unknown[]) => string
  >;
}

/** Writebook's `fixture_file_upload(name, type)`. */
export async function fixtureFileUpload(name: string, type: string): Promise<unknown> {
  const { UploadedFile } = await import("@blazetrails/rack-test");
  return new UploadedFile(fileURLToPath(new URL(`fixtures/files/${name}`, import.meta.url)), type);
}

/** The record a fixture label names, as Rails' `books(:handbook)` reads it. */
export async function fixture<T>(set: keyof typeof FIXTURE_CLASSES, label: string): Promise<T> {
  return (await (FIXTURE_CLASSES[set] as unknown as typeof Base).find(
    FixtureSet.identify(label),
  )) as T;
}

const { expect } = await import("vitest");
const { isPresent } = await import("@blazetrails/activesupport");
const { IntegrationTest } = await import("@blazetrails/actionpack/testing");
const { ActionDispatch, CookieJar } = await import("@blazetrails/actionpack");

/**
 * `app` is overridden because `IntegrationTest#app` recurses without it (story
 * integration-test-app-recurses-without-override).
 */
export class ApplicationIntegrationTest extends IntegrationTest {
  override get app() {
    return ActionDispatch.testApp as never;
  }

  /** Writebook's `SessionTestHelper#parsed_cookies`. */
  parsedCookies() {
    return CookieJar.build(this.request as never, this.cookies.toHash() as Record<string, string>);
  }

  /** Writebook's `SessionTestHelper#sign_in`. */
  async signIn(user: string | InstanceType<typeof User>): Promise<void> {
    if (!(user instanceof User)) user = await fixture<InstanceType<typeof User>>("users", user);
    await this.post("/session", {
      params: { email_address: user.email_address, password: "secret123456" },
    });
    expect(isPresent(this.cookies.get("session_token"))).toBe(true);
  }

  /** Writebook's `SessionTestHelper#sign_out`. */
  async signOut(): Promise<void> {
    await this.delete("/session");
    expect(isPresent(this.cookies.get("session_token"))).toBe(false);
  }

  /** Runs the first-run setup and signs in as the administrator it creates. */
  async firstRun(): Promise<void> {
    await this.post("/first_run", {
      params: { user: { name: "Ada", email_address: "ada@example.com", password: "secret123456" } },
    });
  }
}
