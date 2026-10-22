import { Deprecation } from "@blazetrails/activesupport";

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

        /** @internal */
        deprecateOption(name: string): void {
          Deprecation._instance().warn(
            `The ${name} option is deprecated ` +
              "and has no effect. Until Rails 5 the old behavior can still be " +
              "installed. To do this add the `rails-deprecated-sanitizer` to " +
              "your Gemfile. Consult the Rails 4.2 upgrade guide for more information.",
          );
        },
      } as SanitizeHelperClassMethods,
    },
  },
};

type DeprecatedOption =
  | "ProtocolSeparator"
  | "UriAttributes"
  | "BadTags"
  | "AllowedCssProperties"
  | "AllowedCssKeywords"
  | "ShorthandCssProperties"
  | "AllowedProtocols";

type SanitizeHelperClassMethods = {
  setSanitizedAllowedTags(this: unknown, tags: Iterable<string>): void;
  setSanitizedAllowedAttributes(this: unknown, attributes: Iterable<string>): void;
  deprecateOption(name: string): void;
} & { [K in `sanitized${DeprecatedOption}`]: (this: unknown) => void } & {
  [K in `setSanitized${DeprecatedOption}`]: (this: unknown, _: unknown) => void;
};

for (const meth of [
  "protocolSeparator",
  "uriAttributes",
  "badTags",
  "allowedCssProperties",
  "allowedCssKeywords",
  "shorthandCssProperties",
  "allowedProtocols",
]) {
  const methName = `sanitized${meth[0].toUpperCase()}${meth.slice(1)}`;
  const ClassMethods = ActionView.Helpers.SanitizeHelper.ClassMethods as unknown as Record<
    string,
    (this: SanitizeHelperClassMethods, ...args: unknown[]) => void
  >;

  ClassMethods[methName] = function () {
    this.deprecateOption(methName);
  };
  ClassMethods[`set${methName[0].toUpperCase()}${methName.slice(1)}`] = function (_: unknown) {
    this.deprecateOption(`${methName}=`);
  };
}
