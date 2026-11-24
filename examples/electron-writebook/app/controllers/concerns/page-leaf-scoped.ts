import { defineModule, included } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Current } from "../../models/current.ts";
import type { Leaf } from "../../models/leaf.ts";

export interface PageLeafScopedHost extends ActionController.Base {
  leaf: Leaf;
}

export const PageLeafScoped = defineModule(
  {
    [included](base: typeof ActionController.Base): void {
      base.beforeAction(":setLeaf");
    },
  },
  undefined,
  {
    async setLeaf(this: PageLeafScopedHost): Promise<void> {
      this.leaf = await (
        Current.user!.leaves as unknown as { active(): { find(id: unknown): Promise<Leaf> } }
      )
        .active()
        .find(this.params.get("page_id"));
    },
  },
);
