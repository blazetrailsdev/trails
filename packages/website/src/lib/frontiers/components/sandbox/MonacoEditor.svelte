<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { HighlightRange } from "../../tutorials/types.js";

  interface Props {
    file?: { path: string; content: string } | null;
    readonly?: boolean;
    highlights?: HighlightRange[];
    onchange?: (content: string) => void;
  }

  let { file = null, readonly = true, highlights = [], onchange }: Props = $props();

  let container: HTMLDivElement;
  let editor = $state<import("monaco-editor").editor.IStandaloneCodeEditor | undefined>();
  let monaco = $state<typeof import("monaco-editor") | undefined>();
  let currentPath = "";
  let decorationIds: string[] = [];

  const THEME_NAME = "blazetrails-earth";

  function inferLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts": return "typescript";
      case "js": return "javascript";
      case "json": return "json";
      case "css": return "css";
      case "html": case "ejs": return "html";
      case "sql": return "sql";
      case "md": return "markdown";
      default: return "plaintext";
    }
  }

  function defineTheme(m: typeof import("monaco-editor")) {
    m.editor.defineTheme(THEME_NAME, {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "6B9E50" },
        { token: "keyword.control", foreground: "6B9E50" },
        { token: "storage", foreground: "6B9E50" },
        { token: "string", foreground: "D4A04A" },
        { token: "string.escape", foreground: "D4A04A" },
        { token: "number", foreground: "D4A04A" },
        { token: "constant", foreground: "D4A04A" },
        { token: "type", foreground: "5B96B5" },
        { token: "type.identifier", foreground: "5B96B5" },
        { token: "class", foreground: "5B96B5" },
        { token: "interface", foreground: "5B96B5" },
        { token: "comment", foreground: "756D62", fontStyle: "italic" },
        { token: "variable", foreground: "E4DED4" },
        { token: "identifier", foreground: "E4DED4" },
        { token: "delimiter", foreground: "A59D91" },
        { token: "operator", foreground: "A59D91" },
        { token: "tag", foreground: "6B9E50" },
        { token: "attribute.name", foreground: "5B96B5" },
        { token: "attribute.value", foreground: "D4A04A" },
      ],
      colors: {
        "editor.background": "#1C1916",
        "editor.foreground": "#E4DED4",
        "editor.lineHighlightBackground": "#272320",
        "editor.selectionBackground": "#353029",
        "editor.inactiveSelectionBackground": "#27232080",
        "editorCursor.foreground": "#6B9E50",
        "editorLineNumber.foreground": "#756D62",
        "editorLineNumber.activeForeground": "#A59D91",
        "editorIndentGuide.background": "#353029",
        "editorIndentGuide.activeBackground": "#4A433B",
        "editorBracketMatch.background": "#35302980",
        "editorBracketMatch.border": "#6B9E50",
        "editor.wordHighlightBackground": "#35302960",
        "editorGutter.background": "#1C1916",
        "editorWidget.background": "#272320",
        "editorWidget.border": "#4A433B",
        "input.background": "#272320",
        "input.border": "#4A433B",
        "input.foreground": "#E4DED4",
        "scrollbarSlider.background": "#35302980",
        "scrollbarSlider.hoverBackground": "#4A433B80",
      },
    });
  }

  let typesLoaded = false;
  async function loadBlazetrailsTypes(m: typeof import("monaco-editor")) {
    if (typesLoaded) return;
    typesLoaded = true;
    try {
      const resp = await fetch("/blazetrails-types.json");
      if (!resp.ok) return;
      const typeMap: Record<string, string> = await resp.json();
      const defaults = m.languages.typescript.typescriptDefaults;
      defaults.setCompilerOptions({
        ...defaults.getCompilerOptions(),
        target: m.languages.typescript.ScriptTarget.ES2022,
        module: m.languages.typescript.ModuleKind.ESNext,
        moduleResolution: m.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        strict: true,
      });
      for (const [path, content] of Object.entries(typeMap)) {
        defaults.addExtraLib(content, path);
      }
    } catch {
      // Types are optional — autocomplete just won't work
    }
  }

  function applyHighlights() {
    if (!editor || !monaco) return;
    const ranges = highlights ?? [];
    const decorations: import("monaco-editor").editor.IModelDeltaDecoration[] =
      ranges.map((h) => ({
        range: new monaco!.Range(h.startLine, 1, h.endLine, 1),
        options: {
          isWholeLine: true,
          className: "bt-highlight-line",
          glyphMarginClassName: "bt-highlight-glyph",
          overviewRuler: {
            color: "#6B9E50",
            position: monaco!.editor.OverviewRulerLane.Left,
          },
        },
      }));
    decorationIds = editor.deltaDecorations(decorationIds, decorations);
    if (ranges.length > 0) {
      editor.revealLineInCenter(ranges[0].startLine);
    }
  }

  $effect(() => {
    if (!editor || !monaco || !file) return;
    if (file.path !== currentPath) {
      const lang = inferLanguage(file.path);
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, lang);
      }
      suppressChangeEvent = true;
      editor.setValue(file.content);
      suppressChangeEvent = false;
      editor.revealLineInCenter(1);
      currentPath = file.path;
      decorationIds = editor.deltaDecorations(decorationIds, []);
      applyHighlights();
    } else {
      const current = editor.getValue();
      if (current !== file.content) {
        suppressChangeEvent = true;
        editor.setValue(file.content);
        suppressChangeEvent = false;
      }
    }
  });

  $effect(() => {
    void highlights;
    applyHighlights();
  });

  $effect(() => {
    if (editor) {
      editor.updateOptions({ readOnly: readonly });
    }
  });

  let destroyed = false;
  let suppressChangeEvent = false;

  onMount(async () => {
    if (!(globalThis as any).MonacoEnvironment) {
      (globalThis as any).MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
          switch (label) {
            case "typescript":
            case "javascript":
              return new Worker(
                new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url),
                { type: "module" },
              );
            case "json":
              return new Worker(
                new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url),
                { type: "module" },
              );
            case "css":
            case "scss":
            case "less":
              return new Worker(
                new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url),
                { type: "module" },
              );
            case "html":
            case "handlebars":
            case "razor":
              return new Worker(
                new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url),
                { type: "module" },
              );
            default:
              return new Worker(
                new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
                { type: "module" },
              );
          }
        },
      };
    }

    monaco = await import("monaco-editor");
    if (destroyed) return;
    defineTheme(monaco);
    loadBlazetrailsTypes(monaco);

    editor = monaco.editor.create(container, {
      value: file?.content ?? "",
      language: file ? inferLanguage(file.path) : "plaintext",
      theme: THEME_NAME,
      readOnly: readonly,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      lineNumbers: "on",
      renderLineHighlight: "line",
      automaticLayout: true,
      glyphMargin: true,
      padding: { top: 8, bottom: 8 },
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      tabSize: 2,
    });

    if (file) {
      currentPath = file.path;
    }

    editor.onDidChangeModelContent(() => {
      if (!readonly && !suppressChangeEvent && editor) {
        onchange?.(editor.getValue());
      }
    });

    applyHighlights();
  });

  onDestroy(() => {
    destroyed = true;
    editor?.dispose();
  });
</script>

<style>
  :global(.bt-highlight-line) {
    background-color: rgba(107, 158, 80, 0.15);
  }
  :global(.bt-highlight-glyph) {
    background-color: #6b9e50;
    width: 3px !important;
    margin-left: 3px;
  }
</style>

{#if !file}
  <div
    class="flex h-full w-full items-center justify-center text-sm text-text-muted"
    data-testid="monaco-empty"
  >
    Select a file to view
  </div>
{/if}
<div
  class="h-full w-full {file ? '' : 'hidden'}"
  data-testid="monaco-editor"
  bind:this={container}
></div>
