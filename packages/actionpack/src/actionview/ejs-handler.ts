/**
 * ActionView EJS Template Handler
 *
 * Renders EJS templates. Supports:
 *   <%= expression %>  — HTML-escaped output
 *   <%- expression %>  — raw (unescaped) output
 *   <% code %>         — execute JavaScript
 *   <%# comment %>     — comment (ignored)
 *
 * All locals are available as variables in the template scope.
 * The `yield` local is available in layouts and contains the
 * rendered content to wrap.
 *
 * Usage:
 *   import { EjsHandler } from "@rails-ts/actionpack/actionview/ejs-handler";
 *   TemplateHandlerRegistry.register(new EjsHandler());
 */

import type { TemplateHandler, RenderContext } from "./template-handler.js";

export class EjsHandler implements TemplateHandler {
  readonly extensions = ["ejs"];

  render(
    source: string,
    locals: Record<string, unknown>,
    context: RenderContext
  ): string {
    return renderEjs(source, { ...locals, ...contextLocals(context) });
  }
}

function contextLocals(context: RenderContext): Record<string, unknown> {
  const locals: Record<string, unknown> = {
    controller_name: context.controller,
    action_name: context.action,
    format: context.format,
  };
  if (context.yield !== undefined) {
    locals.yield = context.yield;
  }
  return locals;
}

/**
 * Minimal EJS renderer. No external dependency needed.
 */
function renderEjs(
  template: string,
  data: Record<string, unknown>
): string {
  const compiled = compileEjs(template);
  return compiled(data);
}

type CompiledTemplate = (data: Record<string, unknown>) => string;

/**
 * Compile an EJS template into a function using code generation.
 *
 * This approach builds a single function body so that control flow
 * (if/else, for loops, etc.) can span multiple EJS blocks:
 *
 *   <% for (const item of items) { %>
 *     <li><%= item.name %></li>
 *   <% } %>
 */
function compileEjs(template: string): CompiledTemplate {
  const parts: string[] = [];
  parts.push("const __out = [];\n");

  let pos = 0;
  const openTag = "<%";
  const closeTag = "%>";

  while (pos < template.length) {
    const start = template.indexOf(openTag, pos);
    if (start === -1) {
      parts.push(`__out.push(${JSON.stringify(template.slice(pos))});\n`);
      break;
    }

    if (start > pos) {
      parts.push(`__out.push(${JSON.stringify(template.slice(pos, start))});\n`);
    }

    const end = template.indexOf(closeTag, start + 2);
    if (end === -1) {
      parts.push(`__out.push(${JSON.stringify(template.slice(start))});\n`);
      break;
    }

    const inner = template.slice(start + 2, end).trim();
    pos = end + 2;

    if (inner.startsWith("#")) {
      // Comment — skip
    } else if (inner.startsWith("=")) {
      // Escaped output
      const expr = inner.slice(1).trim();
      parts.push(`__out.push(__esc(String((${expr}) ?? "")));\n`);
    } else if (inner.startsWith("-")) {
      // Raw output
      const expr = inner.slice(1).trim();
      parts.push(`__out.push(String((${expr}) ?? ""));\n`);
    } else {
      // Code block — emitted directly into the function body
      parts.push(inner + "\n");
    }
  }

  // Remove the leading __out declaration from parts — we'll hoist it
  parts.shift();
  parts.push("return __out.join('');\n");
  const innerBody = parts.join("");

  // Hoist __out before try/catch so it's accessible in the catch block
  const wrappedBody = `const __out = [];\ntry {\n${innerBody}} catch(__e) { if (__e instanceof ReferenceError) { return __out.join(''); } throw __e; }\n`;

  // Return a function that injects data keys as local variables
  return (data: Record<string, unknown>): string => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    try {
      const fn = new Function(...keys, "__esc", wrappedBody);
      return fn(...values, escapeHtml);
    } catch (err) {
      return `EJS compilation error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
