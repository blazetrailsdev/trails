import { NotImplementedError, merge } from "@blazetrails/ruby-compat";
import type { Parameters } from "@blazetrails/actionpack";
import { include, type Included } from "@blazetrails/activesupport";
import { Turbo } from "@blazetrails/turbo";
import { ApplicationController } from "./application-controller.ts";
import { SetBookLeaf } from "./concerns/set-book-leaf.ts";
import type { Book } from "../models/book.ts";
import { Current } from "../models/current.ts";
import type { Leaf } from "../models/leaf.ts";
import type { Leafable } from "../models/leafable.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LeafablesController extends Included<typeof SetBookLeaf> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LeafablesController extends ApplicationController {
  declare book: Book;
  declare leaf: Leaf;
  declare leafable: Leafable;

  static {
    this.allowUnauthenticatedAccess({ only: "show" });

    include(this, SetBookLeaf);

    this.beforeAction(":ensureEditable", { except: "show" });
    this.beforeAction(":broadcastBeingEditedIndicator", { only: "update" });
  }

  async new(): Promise<void> {
    this.leafable = await this.newLeafable();
  }

  async create(): Promise<void> {
    this.leaf = await this.book.press(await this.newLeafable(), await this.leafParams());
    this.leaf.association("book").target = this.book;
    await this.positionNewLeaf(this.leaf);
  }

  async show(): Promise<void> {}

  async edit(): Promise<void> {}

  async update(): Promise<void> {
    await this.leaf.edit({
      leafableParams: this.leafableParams(),
      leafParams: await this.leafParams(),
    });

    await this.respondTo((format: Record<string, (block?: () => unknown) => void>) => {
      format.turboStream(() => this.render());
      format.html(() => this.head(":no_content"));
    });
  }

  async destroy(): Promise<void> {
    await this.leaf.trashedBang();

    await this.respondTo((format: Record<string, (block?: () => unknown) => void>) => {
      format.turboStream(() => this.render());
      format.html(() => this.redirectTo(this.bookSlugUrl(this.book)));
    });
  }

  protected async leafParams(): Promise<Record<string, unknown>> {
    return merge(
      await this.defaultLeafParams(),
      (this.params.fetch("leaf", {}) as Parameters).permit("title").toHash() as Record<
        string,
        unknown
      >,
    );
  }

  protected async defaultLeafParams(): Promise<Record<string, unknown>> {
    const leafable = await this.newLeafable();
    return {
      title: (
        leafable.constructor as unknown as { modelName: { human(): string } }
      ).modelName.human(),
    };
  }

  protected async newLeafable(): Promise<Leafable> {
    throw new NotImplementedError("Implement in subclass");
  }

  protected leafableParams(): Parameters {
    throw new NotImplementedError("Implement in subclass");
  }

  private async broadcastBeingEditedIndicator(): Promise<void> {
    await Turbo.StreamsChannel!.broadcastRenderLaterTo(this.leaf, "being_edited", {
      partial: "leaves/being-edited-by",
      locals: { leaf: this.leaf, user: Current.user! },
    });
  }

  private async positionNewLeaf(leaf: Leaf): Promise<void> {
    const position = this.params.get("position");
    if (position != null) {
      await leaf.moveToPosition(Number.parseInt(String(position), 10) || 0);
    }
  }
}
