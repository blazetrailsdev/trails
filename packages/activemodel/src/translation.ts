/**
 * Translation mixin — provides human_attribute_name and i18n_scope.
 *
 * Mirrors: ActiveModel::Translation
 *
 * In Rails this is a module included into ActiveModel::Model that provides
 * i18n-aware attribute name translation. The class-level methods (i18nScope,
 * humanAttributeName, lookupAncestors) are on the Model constructor; we
 * express the contract here as an interface for the static side.
 */
export interface TranslationClassMethods {
  readonly i18nScope: string;
  lookupAncestors(): unknown[];
  humanAttributeName(attr: string): string;
}

export type Translation = TranslationClassMethods;

let _raiseOnMissingTranslations = false;

export function raiseOnMissingTranslations(value?: boolean): boolean {
  if (value !== undefined) {
    _raiseOnMissingTranslations = value;
  }
  return _raiseOnMissingTranslations;
}
