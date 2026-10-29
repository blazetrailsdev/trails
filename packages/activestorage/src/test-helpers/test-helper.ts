import { Base, registerModel } from "@blazetrails/activerecord";
import type { AssociationProxy } from "@blazetrails/activerecord/associations/collection-proxy";

export class User extends Base {
  declare name: string | null;
  declare recordCallbacks: boolean | undefined;
  declare callbackCounter: number | undefined;

  static {
    this.validates("name", { presence: true });

    this.afterCommit((user: User) => user.incrementCallbackCounter());
  }

  incrementCallbackCounter(): void {
    if (this.recordCallbacks) {
      this.callbackCounter ??= 0;
      this.callbackCounter += 1;
    }
  }
}
registerModel(User);

export class Group extends Base {
  declare users: AssociationProxy<User>;

  static {
    this.hasMany("users", { autosave: true });

    this.acceptsNestedAttributesFor("users");
  }
}
registerModel(Group);
