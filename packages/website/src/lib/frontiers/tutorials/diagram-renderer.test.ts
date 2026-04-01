import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderDiagram, resetMermaid } from "./diagram-renderer.js";

vi.mock("mermaid", () => {
  const renderFn = vi.fn();
  return {
    default: {
      initialize: vi.fn(),
      render: renderFn,
    },
    __renderFn: renderFn,
  };
});

async function getMockRender() {
  const mod = await import("mermaid");
  return (mod as any).__renderFn as ReturnType<typeof vi.fn>;
}

beforeEach(async () => {
  resetMermaid();
  const render = await getMockRender();
  render.mockReset();
});

describe("renderDiagram", () => {
  it("returns SVG on success", async () => {
    const render = await getMockRender();
    render.mockResolvedValue({ svg: "<svg>test</svg>" });

    const result = await renderDiagram("graph TD; A-->B");
    expect(result.success).toBe(true);
    expect(result.svg).toBe("<svg>test</svg>");
  });

  it("passes source to mermaid.render", async () => {
    const render = await getMockRender();
    render.mockResolvedValue({ svg: "<svg/>" });

    await renderDiagram("sequenceDiagram\n  A->>B: Hello");
    expect(render).toHaveBeenCalledWith(expect.any(String), "sequenceDiagram\n  A->>B: Hello");
  });

  it("returns error on mermaid failure", async () => {
    const render = await getMockRender();
    render.mockRejectedValue(new Error("Parse error on line 1"));

    const result = await renderDiagram("invalid syntax");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Parse error");
  });

  it("returns error for non-Error throws", async () => {
    const render = await getMockRender();
    render.mockRejectedValue("string error");

    const result = await renderDiagram("bad");
    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });

  it("uses unique IDs for each render call", async () => {
    const render = await getMockRender();
    render.mockResolvedValue({ svg: "<svg/>" });

    await renderDiagram("graph TD; A-->B");
    await renderDiagram("graph TD; C-->D");

    const id1 = render.mock.calls[0][0];
    const id2 = render.mock.calls[1][0];
    expect(id1).not.toBe(id2);
  });

  it("initializes mermaid only once across multiple renders", async () => {
    const render = await getMockRender();
    render.mockResolvedValue({ svg: "<svg/>" });
    const mod = await import("mermaid");
    const initSpy = mod.default.initialize as ReturnType<typeof vi.fn>;
    initSpy.mockClear();

    await renderDiagram("graph TD; A-->B");
    await renderDiagram("graph TD; C-->D");

    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it("mermaid.initialize receives earth-tone theme", async () => {
    const render = await getMockRender();
    render.mockResolvedValue({ svg: "<svg/>" });
    const mod = await import("mermaid");
    const initSpy = mod.default.initialize as ReturnType<typeof vi.fn>;
    initSpy.mockClear();

    await renderDiagram("graph TD; A-->B");

    const config = initSpy.mock.calls[0][0];
    expect(config.startOnLoad).toBe(false);
    expect(config.theme).toBe("base");
    expect(config.themeVariables.primaryColor).toBe("#272320");
    expect(config.themeVariables.lineColor).toBe("#6B9E50");
  });
});
