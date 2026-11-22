import type { Base, Relation } from "@blazetrails/activerecord";
import { camelize, Concern, extend, isPresent, type Extended } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import type { RichText } from "./rich-text.js";

type RichTextHost = Base & { [k: string]: unknown };

type HasRichTextOptions = {
  encrypted?: boolean;
  strictLoading?: boolean;
  storeIfBlank?: boolean;
};

/** @noRailsEquivalent PERMANENT */
function loadedRichText(record: RichTextHost, associationName: string): RichText | null {
  const richText = record[associationName] as RichText | null | Promise<RichText | null>;
  if (!(richText instanceof Promise)) return richText;
  void richText.catch(() => {});
  throw new RuntimeError(
    `${associationName} is not loaded; \`await record.${associationName}\` first.`,
  );
}

function hasRichText(
  this: typeof Base,
  name: string,
  {
    encrypted = false,
    strictLoading = this.strictLoadingByDefault,
    storeIfBlank = true,
  }: HasRichTextOptions = {},
): void {
  const associationName = `richText${camelize(name)}`;
  const mixin = this.generatedAssociationMethods();

  function reader(this: RichTextHost): RichText {
    return (
      loadedRichText(this, associationName) ??
      (this[`build${camelize(associationName)}`] as () => RichText).call(this)
    );
  }

  mixin.defineMethod(`is${camelize(name)}`, async function (this: RichTextHost) {
    const richText = (await this[associationName]) as RichText | null;
    await richText?.toPlainText();
    return isPresent(richText);
  });

  let writer: (this: RichTextHost, body: unknown) => Promise<void>;
  if (storeIfBlank) {
    writer = async function (body) {
      await reader.call(this).setBody(body);
    };
  } else {
    writer = async function (body) {
      if (isPresent(body)) {
        await reader.call(this).setBody(body);
      } else {
        const richText = loadedRichText(this, associationName);
        if (isPresent(richText)) {
          await reader.call(this).setBody(body);
          reader.call(this).markForDestruction();
        }
      }
    };
  }
  mixin.defineMethod(`set${camelize(name)}`, writer);

  mixin.moduleEval((m) => {
    Object.defineProperty(m, name, {
      get: reader,
      configurable: true,
      enumerable: true,
    });
  });

  const richTextClassName = encrypted ? "ActionText::EncryptedRichText" : "ActionText::RichText";
  this.hasOne(
    associationName,
    function (this: Relation<Base>) {
      return this.where({ name: name });
    },
    {
      className: richTextClassName,
      as: "record",
      inverseOf: "record",
      autosave: true,
      dependent: "destroy",
      strictLoading: strictLoading,
    },
  );

  this.scope(`with${camelize(associationName)}`, function (this: Relation<Base>) {
    return this.includes(associationName);
  });
  this.scope(`with${camelize(associationName)}AndEmbeds`, function (this: Relation<Base>) {
    return this.includes({ [associationName]: { embedsAttachments: "blob" } });
  });
}

function withAllRichText(this: typeof Base): Relation<Base> {
  return this.includes(richTextAssociationNames.call(this));
}

function richTextAssociationNames(this: typeof Base): string[] {
  return this.reflectOnAllAssociations("hasOne")
    .map((reflection) => reflection.name)
    .filter((n) => /^richText[A-Z]/.test(n));
}

const ClassMethods = { hasRichText, withAllRichText, richTextAssociationNames };

declare module "@blazetrails/activerecord/base.js" {
  namespace Base {
    const hasRichText: typeof ClassMethods.hasRichText;
    const withAllRichText: typeof ClassMethods.withAllRichText;
    const richTextAssociationNames: typeof ClassMethods.richTextAssociationNames;
  }
}

export const Attribute = {} as Extended<typeof Concern> & {
  ClassMethods: typeof ClassMethods;
};
extend(Attribute, Concern);
Attribute.ClassMethods = ClassMethods;

ActionText.Attribute = Attribute;
