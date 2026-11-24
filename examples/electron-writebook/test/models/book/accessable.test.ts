import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadFixtures } from "../../test-helper.ts";
import { Book } from "../../../app/models/book.ts";
import { User } from "../../../app/models/user.ts";

describe("Book::AccessableTest", () => {
  beforeEach(loadFixtures);

  it("update_access always grants read access to everyone when everyone_access is set", async () => {
    const book = (await Book.createBang({ title: "My new book" })) as Book;
    await book.updateAccess({ editors: [], readers: [] });

    expect(book.everyone_access).toBe(true);

    for (const user of await User.all().toArray()) {
      expect(await book.isAccessable({ user })).toBe(true);
      if (!user.isAdministrator()) expect(await book.isEditable({ user })).toBe(false);
    }
  });

  it("update_access updates existing access", async () => {
    const book = (await Book.createBang({ title: "My new book", everyone_access: false })) as Book;
    const kevin = await fixture<User>("users", "kevin");

    await book.updateAccess({ editors: [kevin.id as number], readers: [] });
    expect(await book.isEditable({ user: kevin })).toBe(true);

    await book.updateAccess({ editors: [], readers: [kevin.id as number] });
    expect(await book.isAccessable({ user: kevin })).toBe(true);
    expect(await book.isEditable({ user: kevin })).toBe(false);
  });

  it("update_access removes stale accesses", async () => {
    const book = (await Book.createBang({ title: "My new book", everyone_access: false })) as Book;
    const kevin = await fixture<User>("users", "kevin");
    const jz = await fixture<User>("users", "jz");

    await book.updateAccess({ editors: [kevin.id as number], readers: [jz.id as number] });
    expect(await book.accesses.size()).toBe(2);

    await book.updateAccess({ editors: [kevin.id as number], readers: [] });
    expect(await book.accesses.size()).toBe(1);
  });
});
