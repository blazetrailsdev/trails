export const ActionView = {
  Helpers: {
    SanitizeHelper: {
      ClassMethods: {
        setSanitizedAllowedTags(
          this: {
            readonly sanitizerVendor: {
              safeListSanitizer: {
                allowedTags: Iterable<string>;
                allowedAttributes: Iterable<string>;
              };
            };
          },
          tags: Iterable<string>,
        ): void {
          this.sanitizerVendor.safeListSanitizer.allowedTags = tags;
        },

        setSanitizedAllowedAttributes(
          this: {
            readonly sanitizerVendor: {
              safeListSanitizer: {
                allowedTags: Iterable<string>;
                allowedAttributes: Iterable<string>;
              };
            };
          },
          attributes: Iterable<string>,
        ): void {
          this.sanitizerVendor.safeListSanitizer.allowedAttributes = attributes;
        },
      },
    },
  },
};
