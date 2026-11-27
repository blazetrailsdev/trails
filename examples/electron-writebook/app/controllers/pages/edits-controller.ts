import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { PageLeafScoped } from "../concerns/page-leaf-scoped.ts";
import type { Edit } from "../../models/edit.ts";
import type { Leaf } from "../../models/leaf.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface EditsController extends Included<typeof PageLeafScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class EditsController extends ApplicationController {
  declare leaf: Leaf;
  declare edit: Edit;

  static {
    include(this, PageLeafScoped);

    this.beforeAction(":ensureEditable");
    this.beforeAction(":setEdit");
  }

  async show(): Promise<void> {}

  private async ensureEditable(): Promise<void> {
    const book = await this.leaf.book;
    this.leaf.association("book").target = book;
    if (!(await book.isEditable())) await this.head(":forbidden");
  }

  private async setEdit(): Promise<void> {
    if (this.params.get("id") === "latest") {
      this.edit = (await this.leaf.edits.last()) as Edit;
    } else {
      this.edit = await this.leaf.edits.find(this.params.get("id"));
    }
  }
}
