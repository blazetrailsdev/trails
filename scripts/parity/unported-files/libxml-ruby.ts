/**
 * Entries scoped to `package: "libxml-ruby"`. The denominator is what
 * ActiveSupport's XmlMini backends call
 * (rails/v8.0.5.2/activesupport/lib/active_support/xml_mini/libxml.rb,
 * libxmlsax.rb), as pg's is what activerecord calls (RFC 0186 § "Scoring").
 * Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_CALLED = "not called by activesupport";

export const LIBXML_RUBY_UNPORTED_FILES: UnportedFile[] = [
  { pattern: "/attr_decl.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/html_parser.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/namespace.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/namespaces.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/schema/attribute.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/schema/element.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { pattern: "/schema/type.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_attr_decl.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_attributes.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_attr.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_canonicalize.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_deprecated_require.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_document.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_document_write.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_dtd.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_encoding.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_encoding_sax.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_html_parser_context.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_html_parser.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_namespace.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_namespaces.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_cdata.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_comment.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_copy.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_edit.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_pi.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_text.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_write.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_node_xlink.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_parser_context.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_properties.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_reader.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_relaxng.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_schema.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_traversal.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_writer.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_xinclude.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_xml.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_xpath_context.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_xpath_expression.rb", package: "libxml-ruby", reason: NOT_CALLED },
  { testFile: "/test_xpath.rb", package: "libxml-ruby", reason: NOT_CALLED },
];
