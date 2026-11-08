import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Engine, type EngineProperties } from "../lib/erubi.js";

function checkOutput(input: string, src: string, options: EngineProperties, stripFreeze = true) {
  const t = new Engine(input, options);
  let tsrc = t.src;
  if (stripFreeze) tsrc = tsrc.replace(/\.freeze/g, "");
  expect(tsrc).toBe(src);
}

describe("Erubi", () => {
  it("should handle no tags with frozen source", () => {
    checkOutput(
      `a
`,
      `_buf = ::String.new; _buf << 'a
';
_buf.to_s
`,
      {},
    );
  });

  it("should handle no options", () => {
    checkOutput(
      `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 %></td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
`,
      `_buf = ::String.new; _buf << '<table>
 <tbody>
';   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'; _buf << ( i+1 ).to_s; _buf << '</td>
   <td>'; _buf << ::Erubi.h(( item )); _buf << '</td>
  </tr>
';  end 
 _buf << ' </tbody>
</table>
'; _buf << ::Erubi.h(( i+1 )); _buf << '
';
_buf.to_s
`,
      {},
    );
  });

  it("should escape all backslashes and apostrophes in text", () => {
    checkOutput(
      `<table>
 <tbody>' ' \\ \\
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 -%>
</td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
<%
%>`,
      `_buf = ::String.new; _buf << '<table>
 <tbody>\\' \\' \\\\ \\\\
';   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'; _buf << ( i+1 ).to_s; _buf << '</td>
   <td>'; _buf << ::Erubi.h(( item )); _buf << '</td>
  </tr>
';  end 
 _buf << ' </tbody>
</table>
'; _buf << ::Erubi.h(( i+1 )); _buf << '
';
_buf.to_s
`,
      {},
    );
  });

  it("should strip only whitespace for <%, <%- and <%# tags", () => {
    checkOutput(
      `  <% a = 1 %>  
a
  <%- a = 2 %>  
b
  <%# a = 3 %>  
c
 /<% a = 1 %>  
a
/ <%- a = 2 %>  
b
//<%# a = 3 %>  
c
  <% a = 1 %> /
a
  <%- a = 2 %>/ 
b
  <%# a = 3 %>//
c
`,
      `_buf = ::String.new;   a = 1   
 _buf << 'a
';   a = 2   
 _buf << 'b
';
 _buf << 'c
 /'; a = 1 ; _buf << '  
'; _buf << 'a
/ '; a = 2 ; _buf << '  
'; _buf << 'b
//';
 _buf << '  
'; _buf << 'c
'; _buf << '  '; a = 1 ; _buf << ' /
a
'; _buf << '  '; a = 2 ; _buf << '/ 
b
'; _buf << '  ';; _buf << '//
c
';
_buf.to_s
`,
      {},
    );
  });

  it("should handle ensure option", () => {
    checkOutput(
      `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 %></td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
`,
      `begin; __original_outvar = @a; @a = ::String.new; @a << '<table>
 <tbody>
';   i = 0
     list.each_with_index do |item, i| 
 @a << '  <tr>
   <td>'; @a << ( i+1 ).to_s; @a << '</td>
   <td>'; @a << ::Erubi.h(( item )); @a << '</td>
  </tr>
';  end 
 @a << ' </tbody>
</table>
'; @a << ::Erubi.h(( i+1 )); @a << '
';
@a.to_s
; ensure
  @a = __original_outvar
end
`,
      { ensure: true, bufvar: "@a" },
    );
  });

  it("should handle chain_appends option", () => {
    checkOutput(
      `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 %></td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
`,
      `_buf = ::String.new;; _buf << '<table>
 <tbody>
';    i = 0
     list.each_with_index do |item, i| 
; _buf << '  <tr>
   <td>' << ( i+1 ).to_s << '</td>
   <td>' << ::Erubi.h(( item )) << '</td>
  </tr>
';   end 
; _buf << ' </tbody>
</table>
' << ::Erubi.h(( i+1 )) << '
'
; _buf.to_s
`,
      { chainAppends: true },
    );
  });

  it("should handle <%% and <%# syntax", () => {
    checkOutput(
      `<table>
<%% for item in @items %>
  <tr>
    <td><%# i+1 %></td>
    <td><%# item %></td>
  </tr>
  <%% end %>
</table>
`,
      `_buf = ::String.new; _buf << '<table>
'; _buf << '<% for item in @items %>
'; _buf << '  <tr>
    <td>';; _buf << '</td>
    <td>';; _buf << '</td>
  </tr>
'; _buf << '  <% end %>
'; _buf << '</table>
';
_buf.to_s
`,
      {},
    );
  });

  it("should handle <%% with a different literal prefix/postfix", () => {
    checkOutput(
      `<table>
  <%% for item in @items %>
  <tr>
  </tr>
  <%% end %>
  <%%= "literal" %>
</table>
`,
      `_buf = ::String.new; _buf << '<table>
'; _buf << '  {% for item in @items %}
'; _buf << '  <tr>
  </tr>
'; _buf << '  {% end %}
'; _buf << '  {%= "literal" %}
'; _buf << '</table>
';
_buf.to_s
`,
      { literalPrefix: "{%", literalPostfix: "%}" },
    );
  });

  it("should handle :escape option without :escapefunc option", () => {
    checkOutput(
      `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%== i+1 %></td>
   <td><%= item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
`,
      `__erubi = ::Erubi; _buf = ::String.new; _buf << '<table>
 <tbody>
';   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'; _buf << ( i+1 ).to_s; _buf << '</td>
   <td>'; _buf << __erubi.h(( item )); _buf << '</td>
  </tr>
';  end 
 _buf << ' </tbody>
</table>
';
_buf.to_s
`,
      { escape: true },
    );
  });

  it("should handle :preamble and :postamble options", () => {
    checkOutput(
      `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 %></td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
`,
      `_buf = String.new("1"); _buf << '<table>
 <tbody>
';   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'; _buf << ( i+1 ).to_s; _buf << '</td>
   <td>'; _buf << ::Erubi.h(( item )); _buf << '</td>
  </tr>
';  end 
 _buf << ' </tbody>
</table>
'; _buf << ::Erubi.h(( i+1 )); _buf << '
';
_buf[0...18]
`,
      { preamble: '_buf = String.new("1");', postamble: "_buf[0...18]\n" },
    );
  });

  for (const v of ["outvar", "bufvar"]) {
    it(`should handle :${v} and :freeze options`, () => {
      checkOutput(
        `<table>
  <% for item in @items %>
  <tr>
    <td><%= i+1 %></td>
    <td><%== item %></td>
  </tr>
  <% end %>
</table>
`,
        `# frozen_string_literal: true
@_out_buf = ::String.new; @_out_buf << '<table>
';   for item in @items 
 @_out_buf << '  <tr>
    <td>'; @_out_buf << ( i+1 ).to_s; @_out_buf << '</td>
    <td>'; @_out_buf << ::Erubi.h(( item )); @_out_buf << '</td>
  </tr>
';   end 
 @_out_buf << '</table>
';
@_out_buf.to_s
`,
        { [v === "outvar" ? "outvar" : "bufvar"]: "@_out_buf", freeze: true },
      );
    });
  }

  for (const o of ["escape", "escape_html"]) {
    it(`should handle :${o} and :escapefunc options`, () => {
      checkOutput(
        `<table>
 <tbody>
  <% i = 0
     list.each_with_index do |item, i| %>
  <tr>
   <td><%= i+1 %></td>
   <td><%== item %></td>
  </tr>
 <% end %>
 </tbody>
</table>
<%== i+1 %>
`,
        `_buf = ::String.new; _buf << '<table>
 <tbody>
';   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'; _buf << h.call(( i+1 )); _buf << '</td>
   <td>'; _buf << ( item ).to_s; _buf << '</td>
  </tr>
';  end 
 _buf << ' </tbody>
</table>
'; _buf << ( i+1 ).to_s; _buf << '
';
_buf.to_s
`,
        { [o === "escape" ? "escape" : "escapeHtml"]: true, escapefunc: "h.call" },
      );
    });
  }

  it("should have working filename accessor", () => {
    expect(new Engine("", { filename: "foo.rb" }).filename).toBe("foo.rb");
  });

  it("should have working bufvar accessor", () => {
    expect(new Engine("", { bufvar: "foo" }).bufvar).toBe("foo");
    expect(new Engine("", { outvar: "foo" }).bufvar).toBe("foo");
  });

  it("should return frozen object", () => {
    expect(Object.isFrozen(new Engine(""))).toBe(true);
  });

  it("should have frozen src", () => {
    expect(Object.isFrozen(new Engine("").src)).toBe(true);
  });

  it("should raise an error if a tag is not handled when a custom regexp is used", () => {
    expect(
      () => new Engine("<%] %>", { regexp: /<%(={1,2}|\]|-|#|%)?(.*?)([-=])?%>([ \t]*\r?\n)?/s }),
    ).toThrow(ArgumentError);
  });
});
