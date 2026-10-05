import { Concern, Module, classAttribute, extend, include } from "@blazetrails/activesupport";
import { Digestor, type LookupContext, type Template } from "@blazetrails/actionview";
import { ConditionalGet, type Etagger } from "./conditional-get.js";

/** @internal */
export interface EtagWithTemplateDigestHost {
  actionName: string;
  lookupContext: LookupContext;
  _prefixes(): string[];
}

/** @internal */
export function determineTemplateEtag(
  this: EtagWithTemplateDigestHost,
  options: { template?: string | false | null },
): ReturnType<typeof Digestor.digest> | undefined {
  const template = pickTemplateForEtag.call(this, options);
  if (template != null) {
    return lookupAndDigestTemplate.call(this, template);
  }
}

/** @internal */
export function pickTemplateForEtag(
  this: EtagWithTemplateDigestHost,
  options: { template?: string | false | null },
): string | null | undefined {
  if (!(options.template === false)) {
    return options.template != null
      ? options.template
      : (this.lookupContext.findAll(this.actionName, this._prefixes())[0] as Template | undefined)
          ?.virtualPath;
  }
}

/** @internal */
export function lookupAndDigestTemplate(
  this: EtagWithTemplateDigestHost,
  template: string,
): ReturnType<typeof Digestor.digest> {
  return Digestor.digest({ name: template, format: null, finder: this.lookupContext });
}

export const EtagWithTemplateDigest = new Module((mod) => {
  extend(mod, Concern);

  include(mod, ConditionalGet);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      classAttribute.call(this, "etagWithTemplateDigest", { default: true });

      (this as typeof ConditionalGet.ClassMethods & { etaggers: Etagger[] }).etag(function (
        this: unknown,
        options,
      ) {
        const controller = this as EtagWithTemplateDigestHost & { etagWithTemplateDigest: boolean };
        if (controller.etagWithTemplateDigest) {
          return determineTemplateEtag.call(controller, options);
        }
      });
    },
  );
});
