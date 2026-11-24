import type { Parameters } from "@blazetrails/actionpack";
import { LeafablesController } from "./leafables-controller.ts";
import { Page } from "../models/page.ts";

export class PagesController extends LeafablesController {
  declare page: Page;

  static {
    this.beforeAction(":forgetReadingProgress", { except: "show" });
  }

  private forgetReadingProgress(): void {
    this.cookies().delete(`reading_progress_${this.book.id}`);
  }

  protected override async defaultLeafParams(): Promise<Record<string, unknown>> {
    return { title: "Untitled" };
  }

  protected override async newLeafable(): Promise<Page> {
    const leafable = new Page();
    await leafable.setAttributes(this.leafableParams());
    return leafable;
  }

  protected override leafableParams(): Parameters {
    return (this.params.fetch("page", {}) as Parameters).permit("body");
  }
}
