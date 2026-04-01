import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import TabPanel from "./TabPanel.svelte";

afterEach(() => cleanup());

const tabs = [
  { id: "files", label: "Files" },
  { id: "editor", label: "Editor" },
  { id: "database", label: "Database" },
];

describe("TabPanel", () => {
  it("renders tab buttons from tabs prop", () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent?.trim()).toBe("Files");
    expect(buttons[1].textContent?.trim()).toBe("Editor");
    expect(buttons[2].textContent?.trim()).toBe("Database");
  });

  it("first tab is active by default", () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
    expect(buttons[1].getAttribute("aria-selected")).toBe("false");
  });

  it("switches active tab on click", async () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    await fireEvent.click(buttons[2]);
    expect(buttons[2].getAttribute("aria-selected")).toBe("true");
    expect(buttons[0].getAttribute("aria-selected")).toBe("false");
  });

  it("calls onchange when tab is switched", async () => {
    const onchange = vi.fn();
    render(TabPanel, {
      props: { tabs, onchange, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    await fireEvent.click(buttons[1]);
    expect(onchange).toHaveBeenCalledWith("editor");
  });

  it("navigates tabs with arrow keys", async () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");

    await fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");

    await fireEvent.keyDown(buttons[1], { key: "ArrowRight" });
    expect(buttons[2].getAttribute("aria-selected")).toBe("true");

    await fireEvent.keyDown(buttons[2], { key: "ArrowRight" });
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
  });

  it("wraps around with arrow left from first tab", async () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    await fireEvent.keyDown(buttons[0], { key: "ArrowLeft" });
    expect(buttons[2].getAttribute("aria-selected")).toBe("true");
  });

  it("active tab has tabindex=0, others tabindex=-1", () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    expect(buttons[0].getAttribute("tabindex")).toBe("0");
    expect(buttons[1].getAttribute("tabindex")).toBe("-1");
    expect(buttons[2].getAttribute("tabindex")).toBe("-1");
  });

  it("respects activeTab prop", () => {
    render(TabPanel, {
      props: { tabs, activeTab: "database", children: (_tab: string) => {} },
    });
    const buttons = screen.getAllByTestId("tab-button");
    expect(buttons[2].getAttribute("aria-selected")).toBe("true");
  });

  it("has proper ARIA roles", () => {
    render(TabPanel, {
      props: { tabs, children: (_tab: string) => {} },
    });
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.getAllByRole("tab").length).toBe(3);
  });
});
