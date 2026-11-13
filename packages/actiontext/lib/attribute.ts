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
  } as never);

  let writer: (this: RichTextHost, body: unknown) => void;
  if (storeIfBlank) {
    writer = function (body) {
      reader.call(this).body = body as never;
    };
  } else {
    writer = function (body) {
      if (isPresent(body)) {
        reader.call(this).body = body as never;
      } else {
        const richText = loadedRichText(this, associationName);
        if (isPresent(richText)) {
          reader.call(this).body = body as never;
          reader.call(this).markForDestruction();
        }
      }
    };
  }

  mixin.moduleEval((m) => {
    Object.defineProperty(m, name, {
      get: reader,
      set: writer,
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

export const Attribute = {} as Extended<typeof Concern> & {
  ClassMethods: typeof ClassMethods;
};
extend(Attribute, Concern);
Attribute.ClassMethods = ClassMethods;

ActionText.Attribute = Attribute;
