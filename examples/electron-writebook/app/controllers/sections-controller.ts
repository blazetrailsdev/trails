import type { Parameters } from "@blazetrails/actionpack";
import { LeafablesController } from "./leafables-controller.ts";
import { Section } from "../models/section.ts";

export class SectionsController extends LeafablesController {
  declare section: Section;

  protected override async newLeafable(): Promise<Section> {
    const leafable = new Section();
    await leafable.setAttributes(this.leafableParams());
    return leafable;
  }

  protected override leafableParams(): Parameters {
    return (this.params.fetch("section", {}) as Parameters)
      .permit("body", "theme")
      .withDefaults({ body: this.defaultBody() });
  }

  private defaultBody(): unknown {
    return (this.params.fetch("leaf", {}) as Parameters).get("title");
  }
}
