import { beforeEach, describe, expect, it } from "vitest";
import { Parameters } from "@blazetrails/actionpack";
import { NotNullViolation } from "@blazetrails/activerecord";
import { loadFixtures } from "../test-helper.ts";
import { isolateEmbedProviders } from "../embed-providers-env.ts";
import { Account } from "../../app/models/account.ts";
import { Book } from "../../app/models/book.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";
import { FirstRun } from "../../app/models/first-run.ts";
import { User } from "../../app/models/user.ts";

describe("FirstRunTest", () => {
  const createFirstRunUser = () =>
    FirstRun.createBang(
      new Parameters({
        name: "User",
        email_address: "user@example.com",
        password: "secret123456",
      }).permitBang(),
    );

  beforeEach(async () => {
    await loadFixtures();
    await Book.destroyAll();
    await User.destroyAll();
    await Account.destroyAll();
  });
  isolateEmbedProviders();

  it("creating makes first user an administrator", async () => {
    const user = await createFirstRunUser();
    expect(user.isAdministrator()).toBe(true);
  });

  it("creates an account", async () => {
    const before = await Account.count();
    await createFirstRunUser();
    expect(await Account.count()).toBe(before + 1);
  });

  it("starts a new install on the curated embed providers", async () => {
    await createFirstRunUser();
    await EmbedProvider.resolution();

    expect((await Account.sole()).embed_providers).toEqual(EmbedProvider.DEFAULTS);
    expect(EmbedProvider.isConfigured()).toBe(true);
    expect(EmbedProvider.isAllows("https://www.youtube.com/embed/abc")).toBe(true);
    expect(EmbedProvider.isAllows("https://anything.example/embed/abc")).toBe(false);
  });

  it("an install upgraded from before the setting stays permissive", async () => {
    await Account.createBang({ name: "Upgraded" });
    await EmbedProvider.resolution();

    expect((await Account.sole()).embed_providers).toBeNull();
    expect(EmbedProvider.isConfigured()).toBe(false);
  });

  // PERMANENT-SKIP: the bundled Writebook Manual demo book is left out of this example (README).
  it.skip("creates a demo book", async () => {
    await createFirstRunUser();
    expect(await Book.count()).toBe(1);

    const book = (await Book.first()) as Book;

    expect(await book.isEditable({ user: (await User.first()) as User })).toBe(true);
    expect(book.cover.isAttached()).toBe(true);
    expect(await book.leaves.isAny()).toBe(true);
  });

  it("a first run that can't create its administrator leaves no account behind", async () => {
    await expect(
      FirstRun.createBang(
        new Parameters({
          name: "User",
          email_address: "user@example.com",
          password: "",
        }).permitBang(),
      ),
    ).rejects.toBeInstanceOf(NotNullViolation);

    expect(await Account.isNone()).toBe(true);
  });
});
