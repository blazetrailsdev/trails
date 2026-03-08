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

function compileEjs(template: string): CompiledTemplate {
  // Parse the template into segments
  const segments: Array<
    | { type: "literal"; value: string }
    | { type: "escaped"; expr: string }
    | { type: "raw"; expr: string }
    | { type: "code"; code: string }
  > = [];

  let pos = 0;
  const openTag = "<%";
  const closeTag = "%>";

  while (pos < template.length) {
    const start = template.indexOf(openTag, pos);
    if (start === -1) {
      segments.push({ type: "literal", value: template.slice(pos) });
      break;
    }

    if (start > pos) {
      segments.push({ type: "literal", value: template.slice(pos, start) });
    }

    const end = template.indexOf(closeTag, start + 2);
    if (end === -1) {
      // Unclosed tag — treat rest as literal
      segments.push({ type: "literal", value: template.slice(start) });
      break;
    }

    const inner = template.slice(start + 2, end).trim();
    pos = end + 2;

    if (inner.startsWith("#")) {
      // Comment — skip
      continue;
    } else if (inner.startsWith("=")) {
      // Escaped output
      segments.push({ type: "escaped", expr: inner.slice(1).trim() });
    } else if (inner.startsWith("-")) {
      // Raw output
      segments.push({ type: "raw", expr: inner.slice(1).trim() });
    } else {
      // Code
      segments.push({ type: "code", code: inner });
    }
  }

  // Build a function that evaluates the template
  return (data: Record<string, unknown>): string => {
    const output: string[] = [];
    // Create a scope with all data keys as local-like variables
    const scope = { ...data };

    for (const seg of segments) {
      switch (seg.type) {
        case "literal":
          output.push(seg.value);
          break;
        case "escaped":
          output.push(escapeHtml(String(evalInScope(seg.expr, scope) ?? "")));
          break;
        case "raw":
          output.push(String(evalInScope(seg.expr, scope) ?? ""));
          break;
        case "code":
          evalCodeInScope(seg.code, scope, output);
          break;
      }
    }

    return output.join("");
  };
}

function evalInScope(
  expr: string,
  scope: Record<string, unknown>
): unknown {
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  try {
    const fn = new Function(...keys, `return (${expr});`);
    return fn(...values);
  } catch {
    return undefined;
  }
}

function evalCodeInScope(
  code: string,
  scope: Record<string, unknown>,
  output: string[]
): void {
  const keys = Object.keys(scope);
  const values = Object.values(scope);
  try {
    // Provide __output for code blocks that want to push content
    const fn = new Function(...keys, "__output", code);
    fn(...values, output);
  } catch {
    // Silently ignore code execution errors
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
