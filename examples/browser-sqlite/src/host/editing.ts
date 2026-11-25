const INDENT = "  ";

function insert(editor: HTMLTextAreaElement, text: string): void {
  editor.focus();
  if (document.execCommand("insertText", false, text)) return;
  editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, "end");
  editor.dispatchEvent(new Event("input"));
}

function reindent(editor: HTMLTextAreaElement, outdent: boolean): void {
  const { value, selectionStart: start, selectionEnd: end } = editor;
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const found = value.indexOf("\n", last);
  const to = found < 0 ? value.length : found;
  const before = value.slice(from, to).split("\n");
  const after = before.map((line) =>
    outdent ? line.replace(/^ {1,2}/, "") : line ? INDENT + line : line,
  );
  if (after.join("\n") === before.join("\n")) return;
  editor.setSelectionRange(from, to);
  insert(editor, after.join("\n"));
  const first = after[0].length - before[0].length;
  const total = after.join("\n").length - (to - from);
  editor.setSelectionRange(Math.max(from, start + first), Math.max(from, end + total));
}

function newline(editor: HTMLTextAreaElement): void {
  const { value, selectionStart: start, selectionEnd: end } = editor;
  const line = value.slice(value.lastIndexOf("\n", start - 1) + 1, start);
  const indent = /^[ \t]*/.exec(line)![0];
  const opens = /([{([]|=>)\s*$/.test(line);
  if (opens && /^[})\]]/.test(value.slice(end))) {
    insert(editor, `\n${indent}${INDENT}\n${indent}`);
    const caret = start + 1 + indent.length + INDENT.length;
    editor.setSelectionRange(caret, caret);
    return;
  }
  insert(editor, `\n${indent}${opens ? INDENT : ""}`);
}

/**
 * The editing keys a plain textarea lacks: Tab and Shift+Tab indent, Enter
 * keeps the line's indentation, and every edit goes through the browser's
 * own undo history. Escape releases Tab for one press, so the keyboard can
 * leave the editor.
 */
export function installEditing(editor: HTMLTextAreaElement, onSave: () => void): void {
  let released = false;
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      released = true;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      onSave();
      return;
    }
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (released) {
        released = false;
        return;
      }
      e.preventDefault();
      const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
      if (e.shiftKey || selection.includes("\n")) reindent(editor, e.shiftKey);
      else insert(editor, INDENT);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      e.preventDefault();
      newline(editor);
      return;
    }
    if (e.key !== "Shift") released = false;
  });
}

/** Moves the caret to the start of a 1-based line and scrolls it into view. */
export function goToLine(editor: HTMLTextAreaElement, line: number): void {
  const lines = editor.value.split("\n");
  const offset = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  editor.focus();
  editor.setSelectionRange(offset, offset);
  const height = parseFloat(getComputedStyle(editor).lineHeight);
  editor.scrollTop = Math.max(0, (line - 4) * height);
}
