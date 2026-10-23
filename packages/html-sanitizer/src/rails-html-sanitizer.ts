import { Deprecation, camelize } from "@blazetrails/activesupport";

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

const ClassMethods = ActionView.Helpers.SanitizeHelper.ClassMethods as unknown as Record<
  string,
  (this: SanitizeHelperClassMethods, ...args: unknown[]) => void
>;

for (const meth of [
  "protocol_separator",
  "uri_attributes",
  "bad_tags",
  "allowed_css_properties",
  "allowed_css_keywords",
  "shorthand_css_properties",
  "allowed_protocols",
]) {
  const methName = `sanitized_${meth}`;

  ClassMethods[camelize(methName, false)] = function () {
    this.deprecateOption(methName);
  };
  ClassMethods[camelize(`set_${methName}`, false)] = function (_: unknown) {
    this.deprecateOption(`${methName}=`);
  };
}

/** @internal */
ClassMethods.deprecateOption = function (name: unknown): void {
  Deprecation._instance().warn(
    `The ${name} option is deprecated ` +
      "and has no effect. Until Rails 5 the old behavior can still be " +
      "installed. To do this add the `rails-deprecated-sanitizer` to " +
      "your Gemfile. Consult the Rails 4.2 upgrade guide for more information.",
  );
};
