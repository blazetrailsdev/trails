import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../../application-controller.ts";
import { BookScoped } from "../../concerns/book-scoped.ts";
import type { Book } from "../../../models/book.ts";
import type { Leaf } from "../../../models/leaf.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface MovesController extends Included<typeof BookScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MovesController extends ApplicationController {
  declare book: Book;

  static {
    include(this, BookScoped);

    this.beforeAction(":ensureEditable");
  }

  async create(): Promise<void> {
    const [leaf, ...followedBy] = await this.leaves();
    await leaf.moveToPosition(this.position(), { followedBy });
  }

  private position(): number {
    return Number.parseInt(String(this.params.get("position") ?? 0), 10) || 0;
  }

  private async leaves(): Promise<Leaf[]> {
    const id = this.params.get("id");
    return await this.book.leaves.find([id].flat());
  }
}
