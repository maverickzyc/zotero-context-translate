export interface TextItemLike {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParagraphResult {
  paragraphs: string[];
  rawText: string;
}

interface TextLine {
  y: number;
  items: TextItemLike[];
}

const ABBREVIATIONS = new Set([
  "et al",
  "fig",
  "figs",
  "eq",
  "eqs",
  "vol",
  "no",
  "e.g",
  "i.e",
  "vs",
  "dr",
  "prof",
  "mr",
  "mrs",
  "ms",
  "inc",
  "ltd",
  "jr",
  "sr",
  "dept",
  "approx",
  "est",
  "ref",
  "refs",
  "sect",
  "ch",
  "pp",
]);

export function detectColumns(items: TextItemLike[]): number {
  if (items.length < 4) return 1;
  const xStarts = items.map((it) => Math.round(it.x));
  const xCounts = new Map<number, number>();
  for (const x of xStarts) {
    const bucket = Math.round(x / 20) * 20;
    xCounts.set(bucket, (xCounts.get(bucket) || 0) + 1);
  }
  const significantClusters = [...xCounts.entries()]
    .filter(([_, count]) => count >= items.length * 0.15)
    .map(([x]) => x)
    .sort((a, b) => a - b);
  if (significantClusters.length >= 2) {
    const gap = significantClusters[1] - significantClusters[0];
    if (gap > 100) return 2;
  }
  return 1;
}

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";
  // Split into word-tokens and whitespace-tokens alternately
  const tokens = text.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    current += tokens[i];
    if (/[.?!]\s*$/.test(tokens[i])) {
      const word = tokens[i].replace(/[.?!]\s*$/, "").toLowerCase();
      // Check single-word abbreviation
      if (
        ABBREVIATIONS.has(word) ||
        ABBREVIATIONS.has(word.replace(/\.$/, ""))
      ) {
        continue;
      }
      // Check two-word abbreviation: look back past any whitespace token to find previous word
      // tokens alternate: word, space, word, space, ...
      // So the previous word is at i-2 (if i >= 2)
      if (i >= 2) {
        const prevWord = tokens[i - 2].toLowerCase();
        const twoWord = prevWord + " " + word;
        if (ABBREVIATIONS.has(twoWord)) {
          continue;
        }
      }
      // Decimal numbers: token itself is a decimal (e.g. "0.05") or contains one
      if (
        /^\d+\.\d*$/.test(tokens[i].replace(/[?!]\s*$/, "")) ||
        /\d+\.\d+/.test(tokens[i])
      ) {
        continue;
      }
      sentences.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) {
    sentences.push(current.trim());
  }
  return sentences;
}

function groupIntoLines(items: TextItemLike[]): TextLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];
  let currentLine: TextLine = { y: sorted[0].y, items: [sorted[0]] };
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentLine.y) < item.height * 0.5) {
      currentLine.items.push(item);
    } else {
      currentLine.items.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = { y: item.y, items: [item] };
    }
  }
  currentLine.items.sort((a, b) => a.x - b.x);
  lines.push(currentLine);
  return lines;
}

function lineToText(line: TextLine): string {
  return line.items
    .map((it) => it.str)
    .join("")
    .trim();
}

export function reconstructParagraphs(items: TextItemLike[]): ParagraphResult {
  if (items.length === 0) return { paragraphs: [], rawText: "" };
  const columnCount = detectColumns(items);
  let columnGroups: TextItemLike[][];
  if (columnCount === 2) {
    const xValues = items.map((it) => it.x).sort((a, b) => a - b);
    const midpoint = (xValues[0] + xValues[xValues.length - 1]) / 2;
    columnGroups = [
      items.filter((it) => it.x < midpoint),
      items.filter((it) => it.x >= midpoint),
    ];
  } else {
    columnGroups = [items];
  }
  const allParagraphs: string[] = [];
  for (const colItems of columnGroups) {
    const lines = groupIntoLines(colItems);
    if (lines.length === 0) continue;
    const lineHeights = lines.map((l) =>
      l.items.reduce((max, it) => Math.max(max, it.height), 0),
    );
    const avgLineHeight =
      lineHeights.reduce((sum, h) => sum + h, 0) / lineHeights.length;
    const paragraphs: string[] = [];
    let currentPara = lineToText(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > avgLineHeight * 1.5) {
        paragraphs.push(currentPara);
        currentPara = lineToText(lines[i]);
      } else {
        const lineText = lineToText(lines[i]);
        if (lineText) {
          currentPara += " " + lineText;
        }
      }
    }
    if (currentPara) {
      paragraphs.push(currentPara);
    }
    allParagraphs.push(...paragraphs);
  }
  return { paragraphs: allParagraphs, rawText: allParagraphs.join("\n") };
}
