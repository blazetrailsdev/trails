let mermaidInstance: typeof import("mermaid").default | null = null;
let initPromise: Promise<void> | null = null;

const EARTH_THEME = {
  theme: "base" as const,
  themeVariables: {
    primaryColor: "#272320",
    primaryTextColor: "#E4DED4",
    primaryBorderColor: "#4A433B",
    lineColor: "#6B9E50",
    secondaryColor: "#353029",
    secondaryTextColor: "#A59D91",
    secondaryBorderColor: "#4A433B",
    tertiaryColor: "#1C1916",
    tertiaryTextColor: "#E4DED4",
    tertiaryBorderColor: "#4A433B",
    noteBkgColor: "#353029",
    noteTextColor: "#D4A04A",
    noteBorderColor: "#4A433B",
    edgeLabelBackground: "#272320",
    clusterBkg: "#272320",
    clusterBorder: "#4A433B",
    titleColor: "#6B9E50",
    actorTextColor: "#E4DED4",
    actorBkg: "#272320",
    actorBorder: "#6B9E50",
    actorLineColor: "#4A433B",
    signalColor: "#E4DED4",
    signalTextColor: "#E4DED4",
    labelBoxBkgColor: "#272320",
    labelBoxBorderColor: "#4A433B",
    labelTextColor: "#E4DED4",
    loopTextColor: "#A59D91",
    activationBorderColor: "#6B9E50",
    activationBkgColor: "#353029",
    sequenceNumberColor: "#1C1916",
  },
};

async function ensureInit(): Promise<typeof import("mermaid").default> {
  if (mermaidInstance) return mermaidInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const mod = await import("mermaid");
        mermaidInstance = mod.default;
        mermaidInstance.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          ...EARTH_THEME,
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          fontSize: 12,
        });
      } catch (e) {
        mermaidInstance = null;
        initPromise = null;
        throw e;
      }
    })();
  }

  await initPromise;
  return mermaidInstance!;
}

export interface DiagramResult {
  success: boolean;
  svg?: string;
  error?: string;
}

let renderCounter = 0;

export async function renderDiagram(source: string): Promise<DiagramResult> {
  try {
    const mermaid = await ensureInit();
    const id = `diagram-${renderCounter++}`;
    const { svg } = await mermaid.render(id, source);
    return { success: true, svg };
  } catch (e: unknown) {
    let message: string;
    if (e instanceof Error) {
      message = e.message;
    } else if (typeof e === "string") {
      message = e;
    } else if (e && typeof e === "object" && "message" in e) {
      message = String((e as { message: unknown }).message);
    } else {
      message = "Unknown diagram rendering error";
    }
    return { success: false, error: message };
  }
}

export function resetMermaid(): void {
  mermaidInstance = null;
  initPromise = null;
  renderCounter = 0;
}
