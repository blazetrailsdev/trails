import { beforeEach, describe, expect, it } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { resetDatabase } from "../test-helper.ts";
import { Message } from "../../app/models/message.ts";
import { Room } from "../../app/models/room.ts";
import { User } from "../../app/models/user.ts";

describe("MessageTest", () => {
  let user: User;
  let room: Room;

  beforeEach(async () => {
    await resetDatabase();
    user = await User.createBang({ email_address: "ada@example.com" });
    room = await Room.createBang({ name: "general", creator: user });
  });

  it("needs a body or an attachment", async () => {
    const message = new Message({ room, user, body: "   " });
    expect(await message.save()).toBe(false);
    expect(message.errors.fullMessages).toContain("Write a message or attach a file");
  });

  it("attaches files", async () => {
    const message = new Message({ room, user });
    await message.attachments.attach({
      io: new StringIO("hello"),
      filename: "hello.txt",
      contentType: "text/plain",
    });
    expect(await message.save()).toBe(true);
    const [attachment] = await (await Message.find(message.id)).attachments.attachments;
    expect((await attachment.blob).filename.toString()).toBe("hello.txt");
  });

  it("extracts up to three distinct urls", () => {
    const message = new Message({
      body: "see https://a.example/x and https://b.example, https://a.example/x https://c.example https://d.example",
    });
    expect(message.urls()).toEqual([
      "https://a.example/x",
      "https://b.example,",
      "https://c.example",
    ]);
  });

  it("counts replies on the parent", async () => {
    const parent = await Message.createBang({ room, user, body: "parent" });
    await Message.createBang({ room, user, parent, body: "one" });
    await Message.createBang({ room, user, parent, body: "two" });
    await parent.reload();
    expect(parent.replies_count).toBe(2);
    expect(await Message.topLevel().count()).toBe(1);
  });

  it("groups reactions by emoji", async () => {
    const grace = await User.createBang({ email_address: "grace@example.com" });
    const message = await Message.createBang({ room, user, body: "hi" });
    await message.reactions.createBang({ user, emoji: "👍" });
    await message.reactions.createBang({ user: grace, emoji: "👍" });
    await message.reactions.createBang({ user, emoji: "🎉" });
    expect(await message.reactionGroups()).toEqual([
      ["👍", [user.id, grace.id]],
      ["🎉", [user.id]],
    ]);
    expect((await message.reactions.create({ user, emoji: "👍" })).isPersisted()).toBe(false);
  });
});
