import {
  defineModule,
  extend,
  include,
  included,
  isPresent,
  onLoad,
} from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { Markdown } from "./action-text-markdown.ts";

type Host = Base & Record<string, unknown>;

export const ClassMethods = {
  hasMarkdown(
    this: typeof Base,
    name: string,
    { strictLoading = this.strictLoadingByDefault }: { strictLoading?: boolean } = {},
  ): void {
    const association = `markdown${name[0].toUpperCase()}${name.slice(1)}`;
    const builder = `build${association[0].toUpperCase()}${association.slice(1)}`;

    Object.defineProperties(this.prototype, {
      [name]: {
        value: async function (this: Host) {
          return (await this[association]) ?? (this[builder] as () => Markdown)();
        },
        writable: true,
        configurable: true,
      },
      [`is${name[0].toUpperCase()}${name.slice(1)}`]: {
        value: async function (this: Host) {
          return isPresent(await this[association]);
        },
        writable: true,
        configurable: true,
      },
      [`set${name[0].toUpperCase()}${name.slice(1)}`]: {
        value: async function (this: Host, content: string) {
          const markdown = await (this[name] as () => Promise<Markdown>)();
          markdown.content = content;
        },
        writable: true,
        configurable: true,
      },
    });

    this.hasOne(
      association,
      function () {
        return this.where({ name });
      },
      {
        className: "ActionText::Markdown",
        as: "record",
        inverseOf: "record",
        autosave: true,
        dependent: "destroy",
        strictLoading,
      },
    );

    this.scope(`with${association[0].toUpperCase()}${association.slice(1)}`, function () {
      return this.includes(association);
    });
    this.scope(`with${association[0].toUpperCase()}${association.slice(1)}AndEmbeds`, function () {
      return this.includes({ [association]: { embedsAttachments: "blob" } });
    });
  },
};

export const HasMarkdown = defineModule({
  [included](base: typeof Base): void {
    extend(base, ClassMethods);
  },

  async safeMarkdownAttribute(this: Base, name: string): Promise<Markdown | undefined> {
    const klass = this.constructor;
    const association = `markdown${name[0].toUpperCase()}${name.slice(1)}`;
    if (klass.reflectOnAssociation(association)?.klass === Markdown) {
      return await ((this as Host)[name] as () => Promise<Markdown>)();
    }
  },
});

onLoad("active_record", function (this: typeof Base) {
  include(this, HasMarkdown);
});
