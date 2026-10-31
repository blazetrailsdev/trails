import type { AssertionReceipt } from "../assertion-receipts.js";

export const actioncontroller: Record<string, AssertionReceipt[]> = {
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › does not raise an error when passed a param declared as ASCII-8BIT that contains invalid bytes":
    [
      {
        kind: "assert_equal",
        value: "s:ASCII-8BIT",
        as: null,
        reason:
          'parameter_encoding_test.rb:64 `assert_equal "ASCII-8BIT", @response.body` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly encodes all ASCII_8BIT parameters into binary":
    [
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'parameter_encoding_test.rb:57 `assert_equal ["ASCII-8BIT"], JSON.parse(@response.body).uniq` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly transcodes declared parameters into specified encodings":
    [
      {
        kind: "assert_equal",
        value: "s:Shift_JIS",
        as: null,
        reason:
          'parameter_encoding_test.rb:49 `assert_equal "Shift_JIS", JSON.parse(@response.body)["baz"]` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/parameter_encoding_test.rb › ParameterEncodingTest › properly transcodes parameters of the action specified by skip_parameter_encoding to ASCII_8BIT":
    [
      {
        kind: "assert_equal",
        value: "s:ASCII-8BIT",
        as: null,
        reason:
          'parameter_encoding_test.rb:42 `assert_equal "ASCII-8BIT", @response.body` — a JS string carries no encoding tag and ruby-compat has no binary String carrier for a param value: `forceEncoding` returns a string for a string and `rbObjEncoding` answers UTF-8 for every string (packages/ruby-compat/src/string/force-encoding.ts)',
      },
    ],
  "actioncontroller:controller/routing_test.rb › LegacyRouteSetTests › id encoding": [
    {
      kind: "assert_equal",
      value: null,
      as: null,
      reason:
        'controller/routing_test.rb:112 `assert_equal ::Encoding::UTF_8, hash["id"].encoding` — a JS string carries no encoding tag (CLAUDE.md, "A String has no encoding tag either")',
    },
  ],
};
