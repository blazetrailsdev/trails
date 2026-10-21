export interface SanitizedAllowedHost {
  readonly sanitizerVendor: {
    safeListSanitizer: { allowedTags: Iterable<string>; allowedAttributes: Iterable<string> };
  };
}

export const ActionView = {
  Helpers: {
    SanitizeHelper: {
      ClassMethods: {
        setSanitizedAllowedTags(this: SanitizedAllowedHost, tags: Iterable<string>): void {
          this.sanitizerVendor.safeListSanitizer.allowedTags = tags;
        },

        setSanitizedAllowedAttributes(
          this: SanitizedAllowedHost,
          attributes: Iterable<string>,
        ): void {
          this.sanitizerVendor.safeListSanitizer.allowedAttributes = attributes;
        },
      },
    },
  },
};
