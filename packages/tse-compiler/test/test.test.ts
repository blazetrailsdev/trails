import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Engine, type EngineProperties } from "../lib/erubi.js";
import { CaptureEndEngine, type CaptureEndEngineProperties } from "../lib/capture-end.js";
import { CaptureBlockEngine } from "../lib/capture-block.js";

function checkOutput(
  input: string,
  src: string,
  options: CaptureEndEngineProperties,
  stripFreeze = true,
  engine: new (input: string, options: EngineProperties) => Engine = Engine,
) {
  const t = new engine(input, options);
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

  it("should handle :freeze_template_literals => true option", () => {
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
'.freeze;   i = 0
     list.each_with_index do |item, i| 
 _buf << '  <tr>
   <td>'.freeze; _buf << ( i+1 ).to_s; _buf << '</td>
   <td>'.freeze; _buf << ::Erubi.h(( item )); _buf << '</td>
  </tr>
'.freeze;  end 
 _buf << ' </tbody>
</table>
'.freeze; _buf << ::Erubi.h(( i+1 )); _buf << '
'.freeze;
_buf.to_s
`,
      { freezeTemplateLiterals: true },
      false,
    );
  });

  it("should handle :freeze_template_literals => false option", () => {
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
      { freezeTemplateLiterals: false },
      false,
    );
  });

  it("should handle ensure option with no bufvar", () => {
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
      `begin; __original_outvar = _buf if defined?(_buf); _buf = ::String.new; _buf << '<table>
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
; ensure
  _buf = __original_outvar
end
`,
      { ensure: true },
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

  it("should handle :trim => false option", () => {
    checkOutput(
      `<table>
  <% for item in @items %>
  <tr>
    <td><%# 
    i+1
    %></td>
    <td><%== item %></td>
  </tr>
  <% end %><%#%>
  <% i = 1 %>a
  <% i = 1 %>
</table>
`,
      `_buf = ::String.new; _buf << '<table>
'; _buf << '  '; for item in @items ; _buf << '
'; _buf << '  <tr>
    <td>';

 _buf << '</td>
    <td>'; _buf << ::Erubi.h(( item )); _buf << '</td>
  </tr>
'; _buf << '  '; end ;
 _buf << '
'; _buf << '  '; i = 1 ; _buf << 'a
'; _buf << '  '; i = 1 ; _buf << '
'; _buf << '</table>
';
_buf.to_s
`,
      { trim: false },
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

  describe("CaptureEndEngine", () => {
    const engine = CaptureEndEngine;
    it("should handle trailing rspace with - modifier in <%|= and <%|", () => {
      checkOutput(
        `<%|= '&' -%>
<%| -%>
`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( '&'  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        {},
        true,
        engine,
      );
    });
    it("should handle lspace in <%|=", () => {
      checkOutput(
        `<%|= %><%| %><%|= %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ((  )).to_s; ensure; _buf = __erubi_stack.pop; end;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ((  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        {},
        true,
        engine,
      );
    });
    it("should have <%|= not escape by default", () => {
      checkOutput(
        `<%|= "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        {},
        true,
        engine,
      );
      checkOutput(
        `<%|= "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escape: false },
        true,
        engine,
      );
      checkOutput(
        `<%|= "&" %><%| %>`,
        `__erubi = ::Erubi; _buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << __erubi.h(( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escape: true },
        true,
        engine,
      );
    });
    it("should have <%|== escape by default", () => {
      checkOutput(
        `<%|== "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ::Erubi.h(( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        {},
        true,
        engine,
      );
      checkOutput(
        `<%|== "&" %><%| %>`,
        `__erubi = ::Erubi; _buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escape: true },
        true,
        engine,
      );
      checkOutput(
        `<%|== "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ::Erubi.h(( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escape: false },
        true,
        engine,
      );
    });
    it("should have <%|= and <%|== respect :escape_capture option", () => {
      checkOutput(
        `<%|= "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escapeCapture: false },
        true,
        engine,
      );
      checkOutput(
        `<%|= "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ::Erubi.h(( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escapeCapture: true },
        true,
        engine,
      );
      checkOutput(
        `<%|== "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escapeCapture: true },
        true,
        engine,
      );
      checkOutput(
        `<%|== "&" %><%| %>`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << ::Erubi.h(( "&"  )).to_s; ensure; _buf = __erubi_stack.pop; end;
_buf.to_s
`,
        { escapeCapture: false },
        true,
        engine,
      );
    });
    it("should allow <%|= and <%| for capturing with :escape_capture => false and :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|= bar do %>
   <b><%= '&' %></b>
 <%| end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << (( bar do  @a << '
'; @a << '   <b>'; @a << __erubi.h(( '&' )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escapeCapture: false, escape: true },
        true,
        engine,
      );
    });
    it("should allow <%|== and <%| for capturing with :escape_capture => true and :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|== bar do %>
   <b><%== '&' %></b>
 <%| end %>
 </tbody>
</table>
`,
        `@a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << (( bar do  @a << '
'; @a << '   <b>'; @a << ::Erubi.h(( '&' )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escapeCapture: true, escape: false },
        true,
        engine,
      );
    });
    it("should allow <%|= and <%| for capturing when with :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|= bar do %>
   <b><%= '&' %></b>
 <%| end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << __erubi.h(( bar do  @a << '
'; @a << '   <b>'; @a << __erubi.h(( '&' )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: true },
        true,
        engine,
      );
    });
    it("should handle loops in <%|= and <%| for capturing when with :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|= quux do |i| %>
   <b><%= "\\#{i}&" %></b>
 <%| end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << __erubi.h(( quux do |i|  @a << '
'; @a << '   <b>'; @a << __erubi.h(( "\\#{i}&" )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: true },
        true,
        engine,
      );
    });
    it("should allow <%|= and <%| for nested capturing when with :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|= bar do %>
   <b><%= '&' %></b>
   <%|= baz do %>e<%| end %>
 <%| end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << __erubi.h(( bar do  @a << '
'; @a << '   <b>'; @a << __erubi.h(( '&' )); @a << '</b>
'; @a << '   ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << __erubi.h(( baz do  @a << 'e'; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: true },
        true,
        engine,
      );
    });
    it("should allow <%|== and <%| for capturing when with :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|== bar do %>
   <b><%== '&' %></b>
 <%| end %>
 </tbody>
</table>
`,
        `@a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << ::Erubi.h(( bar do  @a << '
'; @a << '   <b>'; @a << ::Erubi.h(( '&' )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: false },
        true,
        engine,
      );
    });
    it("should handle loops in <%|== and <%| for capturing when with :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|== quux do |i| %>
   <b><%== "\\#{i}&" %></b>
 <%| end %>
 </tbody>
</table>
`,
        `@a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << ::Erubi.h(( quux do |i|  @a << '
'; @a << '   <b>'; @a << ::Erubi.h(( "\\#{i}&" )); @a << '</b>
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: false },
        true,
        engine,
      );
    });
    it("should allow <%|== and <%| for nested capturing when with :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%|== bar do %>
   <b><%== '&' %></b>
   <%|== baz do %>e<%| end %>
 <%| end %>
 </tbody>
</table>
`,
        `@a = ::String.new; @a << '<table>
 <tbody>
'; @a << '  ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << ::Erubi.h(( bar do  @a << '
'; @a << '   <b>'; @a << ::Erubi.h(( '&' )); @a << '</b>
'; @a << '   ';begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << ::Erubi.h(( baz do  @a << 'e'; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' '; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
'; @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: false },
        true,
        engine,
      );
    });
    it("should respect the :yield_returns_buffer option for making templates return the (potentially modified) buffer", () => {
      checkOutput(
        `<%|= bar do |item| %>
Let's eat <%= item %>!
<% nil %><%| end %>
`,
        `@a = ::String.new;begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << (( bar do |item|  @a << '
'; @a << 'Let\\'s eat '; @a << ( item ).to_s; @a << '!
'; nil ; end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
';
@a.to_s
`,
        { bufvar: "@a" },
        true,
        engine,
      );
      checkOutput(
        `<%|= bar do |item| %>
Let's eat <%= item %>!
<% i = i = nil %><%| end %>
`,
        `@a = ::String.new;begin; (__erubi_stack ||= []) << @a; @a = ::String.new; __erubi_stack.last << (( bar do |item|  @a << '
'; @a << 'Let\\'s eat '; @a << ( item ).to_s; @a << '!
'; i = i = nil ; @a;  end )).to_s; ensure; @a = __erubi_stack.pop; end; @a << '
';
@a.to_s
`,
        { bufvar: "@a", yieldReturnsBuffer: true },
        true,
        engine,
      );
    });
    it("should respect the :yield_returns_buffer option for making templates return the (potentially modified) buffer as the result of the block", () => {
      checkOutput(
        `<%|= bar do %>
Let's eat the tacos!
<%| end %>

Delicious!
`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( bar do  _buf << '
'; _buf << 'Let\\'s eat the tacos!
'; _buf;  end )).to_s; ensure; _buf = __erubi_stack.pop; end; _buf << '
'; _buf << '
Delicious!
';
_buf.to_s
`,
        { yieldReturnsBuffer: true },
        true,
        engine,
      );
      checkOutput(
        `<%|= bar("Don't eat the burgers!") do %>
Let's eat burgers!
<%| end %>

Delicious!
`,
        `_buf = ::String.new;begin; (__erubi_stack ||= []) << _buf; _buf = ::String.new; __erubi_stack.last << (( bar("Don't eat the burgers!") do  _buf << '
'; _buf << 'Let\\'s eat burgers!
'; _buf;  end )).to_s; ensure; _buf = __erubi_stack.pop; end; _buf << '
'; _buf << '
Delicious!
';
_buf.to_s
`,
        { yieldReturnsBuffer: true },
        true,
        engine,
      );
    });
  });
  describe("Erubi::CaptureBlockEngine", () => {
    const engine = CaptureBlockEngine;
    it("should handle empty tags by concatening empty string", () => {
      checkOutput(
        `<%= %><%== %>
`,
        `_buf = ::Erubi::CaptureBlockEngine::Buffer.new; _buf <<= '' ; _buf |= '' ; _buf << '
';
_buf.to_s
`,
        {},
        true,
        engine,
      );
    });
    it("should work as specified in documentation", () => {
      checkOutput(
        `<%= upcase_form do %>
  <%= 'foo' %>
<% end %>

`,
        `@a = ::Erubi::CaptureBlockEngine::Buffer.new; @a <<=  upcase_form do ; @a << '
'; @a << '  '; @a <<=  'foo' ; @a << '
'; end 
 @a << '
';
@a.to_s
`,
        { bufvar: "@a" },
        true,
        engine,
      );
    });
    it("should allow <%= and <% for escaped capturing with :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%= bar do %>
   <b><%= '&' %></b>
 <% end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::Erubi::CaptureBlockEngine::Buffer.new; @a << '<table>
 <tbody>
  '; @a |=  bar do ; @a << '
'; @a << '   <b>'; @a |=  '&' ; @a << '</b>
';  end 
 @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: true },
        true,
        engine,
      );
    });
    it("should allow <%= and <% for unescaped capturing when with :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%= bar do %>
   <b><%= '&' %></b>
 <% end %>
 </tbody>
</table>
`,
        `@a = ::Erubi::CaptureBlockEngine::Buffer.new; @a << '<table>
 <tbody>
  '; @a <<=  bar do ; @a << '
'; @a << '   <b>'; @a <<=  '&' ; @a << '</b>
';  end 
 @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: false },
        true,
        engine,
      );
    });
    it("should allow <%== and <% for escaped capturing with :escape => false", () => {
      checkOutput(
        `<table>
 <tbody>
  <%== bar do %>
   <b><%== '&' %></b>
 <% end %>
 </tbody>
</table>
`,
        `@a = ::Erubi::CaptureBlockEngine::Buffer.new; @a << '<table>
 <tbody>
  '; @a |=  bar do ; @a << '
'; @a << '   <b>'; @a |=  '&' ; @a << '</b>
';  end 
 @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: false },
        true,
        engine,
      );
    });
    it("should allow <%== and <% for unescaped capturing when with :escape => true", () => {
      checkOutput(
        `<table>
 <tbody>
  <%== bar do %>
   <b><%== '&' %></b>
 <% end %>
 </tbody>
</table>
`,
        `__erubi = ::Erubi; @a = ::Erubi::CaptureBlockEngine::Buffer.new; @a << '<table>
 <tbody>
  '; @a <<=  bar do ; @a << '
'; @a << '   <b>'; @a <<=  '&' ; @a << '</b>
';  end 
 @a << ' </tbody>
</table>
';
@a.to_s
`,
        { bufvar: "@a", escape: true },
        true,
        engine,
      );
    });
  });
});
