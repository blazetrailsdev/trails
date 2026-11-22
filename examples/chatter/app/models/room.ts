import { ApplicationRecord } from "./application-record.ts";
import type { User } from "./user.ts";

/** A channel (`kind: "channel"`) or a direct conversation (`kind: "direct"`). */
export class Room extends ApplicationRecord {
  static {
    this.belongsTo("creator", { className: "User" });
    this.hasMany("memberships", { dependent: "destroy" });
    this.hasMany("members", { through: "memberships", source: "user" });
    this.hasMany("messages", { dependent: "destroy" });

    this.validates("name", {
      presence: true,
      format: {
        with: /^[a-z0-9][a-z0-9_-]*$/,
        message: "may only contain lowercase letters, numbers, - and _",
      },
      uniqueness: { scope: "kind" },
      length: { maximum: 80 },
      if: (room: Room) => room.isChannel(),
    });

    this.scope("channels", function () {
      return this.where({ kind: "channel" }).order({ name: "asc" });
    });
    this.scope("directs", function () {
      return this.where({ kind: "direct" });
    });
  }

  isChannel(): boolean {
    return this.kind === "channel";
  }

  isDirect(): boolean {
    return this.kind === "direct";
  }

  /** The direct room between two users, created on first use. Its name is the sorted pair of ids. */
  static async directBetween(a: User, b: User): Promise<Room> {
    const name = [a.id, b.id].sort((x, y) => Number(x) - Number(y)).join("-");
    const existing = await Room.findBy({ kind: "direct", name });
    if (existing) return existing;
    const room = await Room.createBang({ kind: "direct", name, creator: a });
    for (const user of a.id === b.id ? [a] : [a, b]) await room.memberships.createBang({ user });
    return room;
  }

  /** The label shown in the sidebar and header: `#name` for a channel, the other person for a DM. */
  async titleFor(viewer: User): Promise<string> {
    if (this.isChannel()) return `#${this.name}`;
    const members = (await this.members.toArray()) as User[];
    const other = members.find((m) => m.id !== viewer.id) ?? viewer;
    return other.displayName();
  }
}
