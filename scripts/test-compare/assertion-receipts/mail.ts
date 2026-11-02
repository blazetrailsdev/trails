import type { AssertionReceipt } from "../assertion-receipts.js";

export const mail: Record<string, AssertionReceipt[]> = {
  "mail:mail/field_spec.rb › parsing › parses full header fields": [
    {
      kind: "expect_to_eq",
      value: null,
      as: null,
      reason:
        'field_spec.rb:16 asserts `field.value.encoding`; a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
    {
      kind: "expect_not_to_output",
      value: null,
      as: null,
      reason:
        "field_spec.rb:11 asserts nothing reaches stderr; `Field.parse` of a valid header has no warn arm to observe, so the port asserts the parsed field.",
    },
  ],
  "mail:mail/header_spec.rb › encoding › should output a parsed version of itself to US-ASCII on encoded and tidy up and sort correctly":
    [
      {
        kind: "expect_to_eq",
        value: null,
        as: null,
        reason:
          'header_spec.rb:583 asserts `encoded.encoding`; a JS string has no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
      },
    ],
  "mail:mail/encodings_spec.rb › B encodings › should complain if there is no encoding passed for Ruby < 1.9":
    [
      {
        kind: "expect_to_raise_error",
        value: "s:Must supply an encoding",
        as: null,
        reason:
          "encodings_spec.rb:112 branches on `respond_to?(:force_encoding)`; the else arm is for Ruby 1.8 and never runs under any supported Ruby, so the port has nothing to assert there.",
      },
    ],
  "mail:mail/encodings_spec.rb › B encodings › should just return the string if us-ascii and asked to B encoded string":
    [
      {
        kind: "expect_to_eq",
        value: null,
        as: null,
        reason:
          "encodings_spec.rb:80 branches on `respond_to?(:force_encoding)`; the else arm is for Ruby 1.8 and never runs under any supported Ruby, so the port has nothing to assert there.",
      },
    ],
  "mail:mail/encodings_spec.rb › B encodings › should split the string up into bite sized chunks that can be wrapped easily":
    [
      {
        kind: "expect_to_eq",
        value: null,
        as: null,
        reason:
          "encodings_spec.rb:122 branches on `respond_to?(:force_encoding)`; the else arm is for Ruby 1.8 and never runs under any supported Ruby, so the port has nothing to assert there.",
      },
    ],
  "mail:mail/encodings_spec.rb › Q encodings › should complain if there is no encoding passed for Ruby < 1.9":
    [
      {
        kind: "expect_to_raise_error",
        value: "s:Must supply an encoding",
        as: null,
        reason:
          "encodings_spec.rb:251 branches on `respond_to?(:force_encoding)`; the else arm is for Ruby 1.8 and never runs under any supported Ruby, so the port has nothing to assert there.",
      },
    ],
  "mail:mail/encodings_spec.rb › Q encodings › should just return the string if us-ascii and asked to Q encoded string":
    [
      {
        kind: "expect_to_eq",
        value: "s:This is a string",
        as: null,
        reason:
          "encodings_spec.rb:240 branches on `respond_to?(:force_encoding)`; the else arm is for Ruby 1.8 and never runs under any supported Ruby, so the port has nothing to assert there.",
      },
    ],
  "mail:mail/encodings_spec.rb › altering an encoded text to decoded and visa versa › unquote and convert to › should unquote a string in the middle of the text":
    [
      {
        kind: "expect_to_eq",
        value: "s:Re: Photos BroschÃ¼re Rand",
        as: "expect_to_eq",
        reason:
          "encodings_spec.rb:615 spells the expected text as octal UTF-8 bytes; a JS string has no encoding tag, so the port spells the decoded characters (CLAUDE.md, A String has no encoding tag either).",
      },
    ],
  "mail:mail/encodings_spec.rb › altering an encoded text to decoded and visa versa › unquote and convert to › should unquote base64 and convert to utf-8":
    [
      {
        kind: "expect_to_eq",
        value: "s:[166417] BekrÃ¦ftelse fra Rejsefeber",
        as: "expect_to_eq",
        reason:
          "encodings_spec.rb:597 spells the expected text as octal UTF-8 bytes; a JS string has no encoding tag, so the port spells the decoded characters (CLAUDE.md, A String has no encoding tag either).",
      },
    ],
  "mail:mail/encodings_spec.rb › altering an encoded text to decoded and visa versa › unquote and convert to › should unquote multiple lines":
    [
      {
        kind: "expect_to_eq",
        value: 's:Re: [12] #137: Inkonsistente verwendung von "HinzufÃ¼gen"',
        as: "expect_to_eq",
        reason:
          "encodings_spec.rb:609 spells the expected text as octal UTF-8 bytes; a JS string has no encoding tag, so the port spells the decoded characters (CLAUDE.md, A String has no encoding tag either).",
      },
    ],
  "mail:mail/encodings_spec.rb › altering an encoded text to decoded and visa versa › unquote and convert to › should unquote quoted printable and convert to utf-8":
    [
      {
        kind: "expect_to_eq",
        value: "s:[166417] BekrÃ¦ftelse fra Rejsefeber",
        as: "expect_to_eq",
        reason:
          "encodings_spec.rb:591 spells the expected text as octal UTF-8 bytes; a JS string has no encoding tag, so the port spells the decoded characters (CLAUDE.md, A String has no encoding tag either).",
      },
    ],
};
