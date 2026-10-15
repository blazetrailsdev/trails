import { I18n, presence } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

interface TranslatorModel {
  modelName: { i18nKey: string };
  constructor: { humanAttributeName?(attribute: string): string };
}

export class Translator {
  private objectName: string;
  private methodAndValue: string;
  private scope: string;
  private model: TranslatorModel | null;

  constructor(
    object: unknown,
    objectName: string,
    methodAndValue: string,
    { scope }: { scope: string },
  ) {
    this.objectName = objectName.replace(/\[(.*)_attributes\]\[\d+\]/g, ".$1");
    this.methodAndValue = methodAndValue;
    this.scope = scope;
    this.model = rbObjRespondTo(object, "toModel")
      ? (object as { toModel(): TranslatorModel }).toModel()
      : null;
  }

  translate(): unknown {
    const translatedAttribute = presence(
      I18n.t(`${this.objectName}.${this.methodAndValue}`, {
        default: this.i18nDefault(),
        scope: this.scope,
      }),
    );
    return translatedAttribute ?? this.humanAttributeName();
  }

  private i18nDefault(): string | string[] {
    if (this.model != null) {
      const key = this.model.modelName.i18nKey;
      return [`:${key}.${this.methodAndValue}`, ""];
    } else {
      return "";
    }
  }

  private humanAttributeName(): string | null {
    if (this.model != null && rbObjRespondTo(this.model.constructor, "humanAttributeName")) {
      return this.model.constructor.humanAttributeName!(this.methodAndValue);
    }
    return null;
  }
}
