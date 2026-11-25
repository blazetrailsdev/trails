import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadFixtures } from "../test-helper.ts";
import { Book } from "../../app/models/book.ts";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  const users = (label: string) => fixture<User>("users", label);

  beforeEach(loadFixtures);

  it("user does not prevent very long passwords", async () => {
    const david = await users("david");
    await david.update({ password: "secret".repeat(50) });
    expect(await david.isValid()).toBe(true);
  });

  it("new users get access to everyone books", async () => {
    const everyoneBook = (await Book.createBang({
      title: "My new book",
      everyone_access: true,
    })) as Book;
    const otherBook = (await Book.createBang({
      title: "My secret book",
      everyone_access: false,
    })) as Book;

    const bob = (await User.createBang({
      email_address: "bob@example.com",
      name: "Bob",
      password: "secret123456",
    })) as User;

    expect(await everyoneBook.isAccessable({ user: bob })).toBe(true);
    expect(await everyoneBook.isEditable({ user: bob })).toBe(false);

    expect(await otherBook.isAccessable({ user: bob })).toBe(false);
  });
});
