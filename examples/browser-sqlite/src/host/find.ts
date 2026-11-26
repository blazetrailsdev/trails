/**
 * Find and replace in the open file. The editor is a transparent textarea
 * over a highlighted backdrop, so the browser's own find cannot show a
 * match; this bar selects each match in the textarea instead. Ctrl+F opens
 * it, Enter and Shift+Enter step through matches, Escape closes it.
 */
export function installFind(editor: HTMLTextAreaElement, bar: HTMLElement): void {
  const query = bar.querySelector<HTMLInputElement>("[name=find]")!;
  const replacement = bar.querySelector<HTMLInputElement>("[name=replace]")!;
  const count = bar.querySelector<HTMLElement>("output")!;

  const matches = (): number[] => {
    const needle = query.value;
    const at: number[] = [];
    if (!needle) return at;
    for (let i = editor.value.indexOf(needle); i >= 0; i = editor.value.indexOf(needle, i + 1))
      at.push(i);
    return at;
  };

  const select = (start: number) => {
    editor.setSelectionRange(start, start + query.value.length);
    const line = editor.value.slice(0, start).split("\n").length;
    const height = parseFloat(getComputedStyle(editor).lineHeight);
    editor.scrollTop = Math.max(0, (line - 4) * height);
    editor.dispatchEvent(new Event("scroll"));
  };

  const step = (back: boolean): boolean => {
    const at = matches();
    count.textContent = at.length ? "" : "No results";
    if (!at.length) return false;
    const from = back ? editor.selectionStart : editor.selectionEnd;
    const next = back
      ? (at.findLast((i) => i < from) ?? at.at(-1)!)
      : (at.find((i) => i >= from) ?? at[0]);
    select(next);
    count.textContent = `${at.indexOf(next) + 1} of ${at.length}`;
    return true;
  };

  const replaceSelection = (text: string) => {
    editor.focus();
    if (!document.execCommand("insertText", false, text)) {
      editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, "end");
      editor.dispatchEvent(new Event("input"));
    }
  };

  const open = () => {
    bar.hidden = false;
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected && !selected.includes("\n")) query.value = selected;
    query.focus();
    query.select();
  };
  const close = () => {
    bar.hidden = true;
    editor.focus();
  };

  addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== "f" && key !== "h") return;
    if (e.target !== editor && !bar.contains(e.target as Node)) return;
    e.preventDefault();
    open();
    if (key === "h") replacement.focus();
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && e.target === query) {
      e.preventDefault();
      step(e.shiftKey);
    } else if (e.key === "Enter" && e.target === replacement) {
      e.preventDefault();
      bar.querySelector<HTMLButtonElement>("[name=one]")!.click();
    }
  });
  query.addEventListener("input", () => {
    editor.setSelectionRange(editor.selectionStart, editor.selectionStart);
    step(false);
  });
  bar.querySelector<HTMLButtonElement>("[name=next]")!.onclick = () => step(false);
  bar.querySelector<HTMLButtonElement>("[name=prev]")!.onclick = () => step(true);
  bar.querySelector<HTMLButtonElement>("[name=close]")!.onclick = close;
  bar.querySelector<HTMLButtonElement>("[name=one]")!.onclick = () => {
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (query.value && selected === query.value) replaceSelection(replacement.value);
    step(false);
    replacement.focus();
  };
  bar.querySelector<HTMLButtonElement>("[name=all]")!.onclick = () => {
    const at = matches();
    if (!at.length) return;
    editor.setSelectionRange(0, editor.value.length);
    replaceSelection(editor.value.split(query.value).join(replacement.value));
    count.textContent = `Replaced ${at.length}`;
  };
}
