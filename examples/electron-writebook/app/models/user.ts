import { include, type Included } from "@blazetrails/activesupport";
import { SecureRandom } from "@blazetrails/ruby-compat";
import type { CollectionProxy, Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import type { Access } from "./access.ts";
import type { Leaf } from "./leaf.ts";
import type { Session } from "./session.ts";
import { Role } from "./user/role.ts";
import {
  Transferable,
  type ClassMethods as TransferableClassMethods,
} from "./user/transferable.ts";
import { Current } from "./current.ts";
import { Book } from "./book.ts";

export interface UserScopes {
  active(): UserRelation;
  ordered(): UserRelation;
  authenticateBy(attributes: Record<string, unknown>): Promise<User | null>;
}

export type UserRelation = Relation<User> & UserScopes;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface User extends Included<typeof Role>, Included<typeof Transferable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class User extends ApplicationRecord {
  declare name: string;
  declare email_address: string | null;
  declare role: "member" | "administrator";
  declare active: boolean;
  declare isAdministrator: () => boolean;
  declare isMember: () => boolean;
  declare sessions: CollectionProxy<Session> & {
    startBang(options: Parameters<typeof Session.startBang>[0]): Promise<Session>;
  };
  declare accesses: CollectionProxy<Access>;
  declare books: CollectionProxy<Book>;
  declare leaves: CollectionProxy<Leaf>;

  declare static active: () => UserRelation;
  declare static ordered: () => UserRelation;

  declare static findByTransferId: (typeof TransferableClassMethods)["findByTransferId"];

  static {
    include(this, Role);
    include(this, Transferable);

    this.hasMany("sessions", { dependent: "destroy" });
    this.hasSecurePassword(undefined, { validations: false });

    this.hasMany("accesses", { dependent: "destroy" });
    this.hasMany("books", { through: "accesses" });
    this.hasMany("leaves", { through: "books" });

    this.afterCreate(":grantAccessToEveryoneBooks");

    this.scope("active", function () {
      return this.where({ active: true });
    });
    this.scope("ordered", function () {
      return this.order("name");
    });
  }

  isCurrent(): boolean {
    return Current.user != null && this.id === Current.user.id;
  }

  async deactivate(): Promise<void> {
    await this.transaction(async () => {
      await this.sessions.deleteAll();
      await this.updateBang({ active: false, email_address: this.deactivedEmailAddress() });
    });
  }

  private deactivedEmailAddress(): string | undefined {
    return this.email_address?.replace(/@/g, `-deactivated-${SecureRandom.uuid()}@`);
  }

  private async grantAccessToEveryoneBooks(): Promise<void> {
    const allAccesses = ((await Book.withEveryoneAccess().ids()) as number[]).map((id) => ({
      book_id: id,
      level: "reader",
    }));
    await this.accesses.insertAll(allAccesses);
  }
}
