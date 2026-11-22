import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { Room } from "../../app/models/room.ts";
import { User } from "../../app/models/user.ts";

describe("RoomTest", () => {
  beforeEach(resetDatabase);

  it("validates a channel name", async () => {
    const creator = await User.createBang({ email_address: "ada@example.com" });
    expect((await Room.create({ name: "plan-budget", creator })).isPersisted()).toBe(true);
    const invalid = await Room.create({ name: "Bad Name", creator });
    expect(invalid.errors.fullMessages).toContain(
      "Name may only contain lowercase letters, numbers, - and _",
    );
    expect((await Room.create({ name: "plan-budget", creator })).isPersisted()).toBe(false);
  });

  it("finds or creates one direct room per pair of users", async () => {
    const ada = await User.createBang({ email_address: "ada@example.com" });
    const grace = await User.createBang({ email_address: "grace@example.com" });
    const room = await Room.directBetween(ada, grace);
    expect(room.isDirect()).toBe(true);
    expect((await Room.directBetween(grace, ada)).id).toBe(room.id);
    expect(await room.members.count()).toBe(2);
  });

  it("titles a channel by name and a direct room by the other member", async () => {
    const ada = await User.createBang({ email_address: "ada@example.com", name: "Ada" });
    const grace = await User.createBang({ email_address: "grace@example.com", name: "Grace" });
    const channel = await Room.createBang({ name: "general", creator: ada });
    expect(await channel.titleFor(ada)).toBe("#general");
    const direct = await Room.directBetween(ada, grace);
    expect(await direct.titleFor(ada)).toBe("Grace");
    expect(await direct.titleFor(grace)).toBe("Ada");
  });
});
