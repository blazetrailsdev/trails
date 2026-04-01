import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import StepNav from "./StepNav.svelte";

afterEach(() => cleanup());

describe("StepNav", () => {
  const defaults = {
    tutorial: "Docs",
    currentStep: 3,
    totalSteps: 8,
    onnavigate: vi.fn(),
  };

  it("renders breadcrumb with tutorial name and step number", () => {
    render(StepNav, { props: defaults });
    expect(screen.getByTestId("step-nav").textContent).toContain("Docs");
    expect(screen.getByTestId("step-nav").textContent).toContain("Step 3");
  });

  it("renders step dots matching totalSteps", () => {
    render(StepNav, { props: defaults });
    const dots = screen.getAllByTestId("step-dot");
    expect(dots).toHaveLength(8);
  });

  it("marks current step dot with aria-current", () => {
    render(StepNav, { props: defaults });
    const dots = screen.getAllByTestId("step-dot");
    expect(dots[2].getAttribute("aria-current")).toBe("step");
    expect(dots[0].getAttribute("aria-current")).toBeNull();
  });

  it("navigates to step when dot is clicked", () => {
    const onnavigate = vi.fn();
    render(StepNav, { props: { ...defaults, onnavigate } });
    fireEvent.click(screen.getAllByTestId("step-dot")[4]);
    expect(onnavigate).toHaveBeenCalledWith(5);
  });

  it("prev button navigates to previous step", () => {
    const onnavigate = vi.fn();
    render(StepNav, { props: { ...defaults, onnavigate } });
    fireEvent.click(screen.getByTestId("prev-button"));
    expect(onnavigate).toHaveBeenCalledWith(2);
  });

  it("next button navigates to next step", () => {
    const onnavigate = vi.fn();
    render(StepNav, { props: { ...defaults, onnavigate } });
    fireEvent.click(screen.getByTestId("next-button"));
    expect(onnavigate).toHaveBeenCalledWith(4);
  });

  it("disables prev on first step", () => {
    render(StepNav, { props: { ...defaults, currentStep: 1 } });
    expect((screen.getByTestId("prev-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables next on last step", () => {
    render(StepNav, { props: { ...defaults, currentStep: 8 } });
    expect((screen.getByTestId("next-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("arrow keys navigate between steps", () => {
    const onnavigate = vi.fn();
    render(StepNav, { props: { ...defaults, onnavigate } });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onnavigate).toHaveBeenCalledWith(4);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onnavigate).toHaveBeenCalledWith(2);
  });

  it("arrow keys respect bounds", () => {
    const onnavigate = vi.fn();
    render(StepNav, { props: { ...defaults, currentStep: 1, onnavigate } });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onnavigate).not.toHaveBeenCalled();
  });
});
