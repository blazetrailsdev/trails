import { defineModule, included, isBlank, parameterize } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";

interface Host extends Base {
  title: string;
  slug: string;
}

export const Sluggable = defineModule({
  [included](base: typeof Base): void {
    base.beforeSave(":generateSlug", {
      if: function (this: Host) {
        return isBlank(this.slug);
      },
    });
  },

  generateSlug(this: Host): void {
    this.slug = parameterize(this.title);
  },
});
