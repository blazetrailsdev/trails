import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";

const mockEditor = {
  setValue: vi.fn(),
  getValue: vi.fn().mockReturnValue(""),
  getModel: vi.fn().mockReturnValue({}),
  revealLineInCenter: vi.fn(),
  deltaDecorations: vi.fn().mockReturnValue([]),
  onDidChangeModelContent: vi.fn(),
  updateOptions: vi.fn(),
  dispose: vi.fn(),
};

const mockCreate = vi.fn().mockReturnValue(mockEditor);
const mockDefineTheme = vi.fn();
const mockSetModelLanguage = vi.fn();

vi.mock("monaco-editor", () => ({
  editor: {
    create: mockCreate,
    defineTheme: mockDefineTheme,
    setModelLanguage: mockSetModelLanguage,
    OverviewRulerLane: { Left: 1 },
  },
  Range: vi.fn().mockImplementation((sl: number, sc: number, el: number, ec: number) => ({
    startLineNumber: sl,
    startColumn: sc,
    endLineNumber: el,
    endColumn: ec,
  })),
}));

import MonacoEditor from "./MonacoEditor.svelte";

afterEach(() => cleanup());

beforeEach(() => {
  mockCreate.mockClear();
  mockCreate.mockReturnValue(mockEditor);
  mockDefineTheme.mockClear();
  mockSetModelLanguage.mockClear();
  mockEditor.setValue.mockClear();
  mockEditor.getValue.mockClear().mockReturnValue("");
  mockEditor.getModel.mockClear().mockReturnValue({});
  mockEditor.revealLineInCenter.mockClear();
  mockEditor.deltaDecorations.mockClear().mockReturnValue([]);
  mockEditor.onDidChangeModelContent.mockClear();
  mockEditor.updateOptions.mockClear();
  mockEditor.dispose.mockClear();
});

describe("MonacoEditor", () => {
  it("renders the editor container", () => {
    render(MonacoEditor, { props: {} });
    expect(screen.getByTestId("monaco-editor")).toBeTruthy();
  });

  it("creates monaco editor on mount", async () => {
    render(MonacoEditor, { props: { file: { path: "test.ts", content: "hello" } } });
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it("passes file content to editor", async () => {
    render(MonacoEditor, {
      props: { file: { path: "app/models/user.ts", content: "class User {}" } },
    });
    await vi.waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
      const opts = mockCreate.mock.calls[0][1];
      expect(opts.value).toBe("class User {}");
    });
  });

  it("sets language from file extension", async () => {
    render(MonacoEditor, {
      props: { file: { path: "config.json", content: "{}" } },
    });
    await vi.waitFor(() => {
      const opts = mockCreate.mock.calls[0][1];
      expect(opts.language).toBe("json");
    });
  });

  it("sets readonly from prop", async () => {
    render(MonacoEditor, {
      props: { file: { path: "test.ts", content: "" }, readonly: true },
    });
    await vi.waitFor(() => {
      const opts = mockCreate.mock.calls[0][1];
      expect(opts.readOnly).toBe(true);
    });
  });

  it("applies earth-tone theme", async () => {
    render(MonacoEditor, { props: {} });
    await vi.waitFor(() => {
      expect(mockDefineTheme).toHaveBeenCalledWith(
        "blazetrails-earth",
        expect.objectContaining({
          base: "vs-dark",
          colors: expect.objectContaining({
            "editor.background": "#1C1916",
            "editorCursor.foreground": "#6B9E50",
          }),
        }),
      );
    });
  });

  it("theme includes correct syntax token colors", async () => {
    render(MonacoEditor, { props: {} });
    await vi.waitFor(() => {
      const themeConfig = mockDefineTheme.mock.calls[0][1];
      const rules = themeConfig.rules;
      expect(rules.find((r: any) => r.token === "keyword").foreground).toBe("6B9E50");
      expect(rules.find((r: any) => r.token === "string").foreground).toBe("D4A04A");
      expect(rules.find((r: any) => r.token === "type").foreground).toBe("5B96B5");
      const comment = rules.find((r: any) => r.token === "comment");
      expect(comment.foreground).toBe("756D62");
      expect(comment.fontStyle).toBe("italic");
    });
  });

  it("disposes editor on destroy", async () => {
    const { unmount } = render(MonacoEditor, { props: {} });
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled());
    unmount();
    expect(mockEditor.dispose).toHaveBeenCalled();
  });

  it("uses minimap disabled and correct font settings", async () => {
    render(MonacoEditor, { props: {} });
    await vi.waitFor(() => {
      const opts = mockCreate.mock.calls[0][1];
      expect(opts.minimap.enabled).toBe(false);
      expect(opts.fontSize).toBe(13);
      expect(opts.fontFamily).toContain("JetBrains Mono");
    });
  });

  it("shows empty state when no file", () => {
    render(MonacoEditor, { props: {} });
    expect(screen.getByTestId("monaco-empty")).toBeTruthy();
    expect(screen.getByTestId("monaco-empty").textContent).toContain("Select a file");
  });

  it("enables glyph margin for highlight decorations", async () => {
    render(MonacoEditor, { props: { file: { path: "test.ts", content: "" } } });
    await vi.waitFor(() => {
      const opts = mockCreate.mock.calls[0][1];
      expect(opts.glyphMargin).toBe(true);
    });
  });
});
