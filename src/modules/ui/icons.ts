const SVG_NS = "http://www.w3.org/2000/svg";

export type UIIconName =
  | "lookup"
  | "translate"
  | "copy"
  | "refresh"
  | "glossary"
  | "history"
  | "pin"
  | "close";

const ICON_PATHS: Record<UIIconName, string[]> = {
  lookup: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m16 16 4 4"],
  translate: [
    "M4 5h9",
    "M8.5 3v2",
    "M6 5c.5 3 2.5 5.5 6 7",
    "M11 5c-.6 3.1-2.5 5.5-6 7",
    "M14 19l3-8 3 8",
    "M15 16h4",
  ],
  copy: [
    "M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z",
    "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2",
  ],
  refresh: [
    "M20 6v5h-5",
    "M4 18v-5h5",
    "M6.1 9a7 7 0 0 1 11.5-2.5L20 11",
    "M17.9 15a7 7 0 0 1-11.5 2.5L4 13",
  ],
  glossary: [
    "M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z",
    "M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z",
    "M16.5 8v5",
    "M14 10.5h5",
  ],
  history: ["M4 5v5h5", "M5.2 15a8 8 0 1 0 .3-6.6L4 10", "M12 7v5l3 2"],
  pin: ["M9 4h6", "m10 4 1 6 3 3H6l3-3 1-6", "M12 13v8"],
  close: ["M5 5l14 14", "M19 5 5 19"],
};

export function createUIIcon(
  document: Document,
  name: UIIconName,
  size = 16,
): SVGSVGElement {
  const svg = document.createElementNS(
    SVG_NS,
    "svg",
  ) as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.style.flexShrink = "0";
  svg.style.pointerEvents = "none";

  for (const pathData of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  }
  return svg;
}
