import { defineModule, extend, included, isPresent } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { Current } from "../current.ts";
import { User } from "../user.ts";
import type { Access } from "../access.ts";
import type { Book, BookRelation } from "../book.ts";

export const ClassMethods = {
  accessableOrPublished(
    this: typeof Book,
    { user = Current.user }: { user?: User | null } = {},
  ): BookRelation {
    if (isPresent(user)) {
      return this.accessableOrPublishedBooks();
    } else {
      return this.published();
    }
  },

  accessableOrPublishedBooks(
    this: typeof Book,
    { user = Current.user }: { user?: User | null } = {},
  ): BookRelation {
    return user!.books.or(this.published()).distinct() as BookRelation;
  },
};

export const Accessable = defineModule({
  [included](base: typeof Base): void {
    extend(base, ClassMethods);
    base.hasMany("accesses", { dependent: "destroy" });
    base.scope("withEveryoneAccess", function () {
      return this.where({ everyone_access: true });
    });
  },

  async isAccessable(
    this: Book,
    { user = Current.user }: { user?: User | null } = {},
  ): Promise<boolean> {
    return await this.accesses.isExists({ user });
  },

  async isEditable(
    this: Book,
    { user = Current.user }: { user?: User | null } = {},
  ): Promise<boolean> {
    return (await this.accessFor({ user }))?.isEditor() || (user?.isAdministrator() ?? false);
  },

  async accessFor(
    this: Book,
    { user = Current.user }: { user?: User | null } = {},
  ): Promise<Access | null> {
    return await this.accesses.findBy({ user });
  },

  async updateAccess(
    this: Book,
    { editors, readers }: { editors: number[]; readers: number[] },
  ): Promise<void> {
    const editorSet = new Set(editors);
    const readerSet = new Set(
      this.everyone_access ? ((await User.active().ids()) as number[]) : readers,
    );

    const all = new Set([...editorSet, ...readerSet]);
    const allAccesses = [...all].map((userId) => ({
      user_id: userId,
      level: editorSet.has(userId) ? "editor" : "reader",
    }));

    await this.accesses.upsertAll(allAccesses, { uniqueBy: ["book_id", "user_id"] });
    await this.accesses
      .where()
      .not({ user_id: [...all] })
      .deleteAll();
  },
});
