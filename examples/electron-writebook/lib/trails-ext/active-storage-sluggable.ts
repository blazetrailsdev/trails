import {
  defineModule,
  include,
  included,
  onLoad,
  parameterize,
  presence,
} from "@blazetrails/activesupport";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { basename, extname } from "node:path";
import { Trails } from "@blazetrails/trailties";
import type { Base } from "@blazetrails/activerecord";

interface Host extends Base {
  slug: string | null;
  filename: { toString(): string };
  slugBasename(): string;
  slugExtension(): string;
  slugFilename(): string;
}

export const Sluggable = defineModule(
  {
    [included](base: typeof Base): void {
      base.beforeCreate(":setSlug");
    },

    slugPath(this: Host): string {
      return (
        Trails.application.routes().urlHelpers() as unknown as {
          actionTextMarkdownUploadPath(slug: string | null): string;
        }
      ).actionTextMarkdownUploadPath(this.slug);
    },
  },
  undefined,
  {
    setSlug(this: Host): void {
      this.slug = `${this.slugBasename()}-${SecureRandom.alphanumeric(6)}.${this.slugExtension()}`;
    },

    slugBasename(this: Host): string {
      const filename = this.slugFilename();
      return parameterize(basename(filename, extname(filename)));
    },

    slugExtension(this: Host): string {
      return parameterize(extname(this.slugFilename()).replaceAll(".", ""));
    },

    slugFilename(this: Host): string {
      return presence(this.slug) ?? this.filename.toString();
    },
  },
);

onLoad("active_storage_attachment", function (this: typeof Base) {
  include(this, Sluggable);
});
