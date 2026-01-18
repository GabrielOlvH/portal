export type AnsiStyle = {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
};

export type AnsiSegment = {
  text: string;
  style: AnsiStyle;
};

export const DEFAULT_TERMINAL_COLOR = '#E6EDF3';

const BASIC_COLORS = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#C0C0C0',
];

const BRIGHT_COLORS = [
  '#808080',
  '#FF0000',
  '#00FF00',
  '#FFFF00',
  '#0000FF',
  '#FF00FF',
  '#00FFFF',
  '#FFFFFF',
];

const ESC = String.fromCharCode(27);
const ANSI_SGR_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const ANSI_SGR_CAPTURE_REGEX = new RegExp(`(${ESC}\\[[0-9;]*m)`, 'g');
const ANSI_SGR_FULL_REGEX = new RegExp(`^${ESC}\\[([0-9;]*)m$`);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rgbToHex(r: number, g: number, b: number) {
  const rr = clamp(r, 0, 255).toString(16).padStart(2, '0');
  const gg = clamp(g, 0, 255).toString(16).padStart(2, '0');
  const bb = clamp(b, 0, 255).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function xtermColor(index: number): string | undefined {
  if (index < 0 || index > 255) return undefined;
  if (index < 8) return BASIC_COLORS[index];
  if (index < 16) return BRIGHT_COLORS[index - 8];
  if (index >= 16 && index <= 231) {
    const idx = index - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const steps = [0, 95, 135, 175, 215, 255];
    return rgbToHex(steps[r], steps[g], steps[b]);
  }
  const gray = 8 + (index - 232) * 10;
  return rgbToHex(gray, gray, gray);
}

function applyColorFromCode(code: number): string | undefined {
  if (code >= 30 && code <= 37) return BASIC_COLORS[code - 30];
  if (code >= 90 && code <= 97) return BRIGHT_COLORS[code - 90];
  if (code >= 40 && code <= 47) return BASIC_COLORS[code - 40];
  if (code >= 100 && code <= 107) return BRIGHT_COLORS[code - 100];
  return undefined;
}

export function stripAnsi(input: string): string {
  return input.replace(ANSI_SGR_REGEX, '');
}

export function parseAnsi(input: string): AnsiSegment[] {
  const parts = input.split(ANSI_SGR_CAPTURE_REGEX);
  const segments: AnsiSegment[] = [];
  let style: AnsiStyle = {};

  for (const part of parts) {
    if (!part) continue;
    const match = part.match(ANSI_SGR_FULL_REGEX);
    if (!match) {
      segments.push({ text: part, style: { ...style } });
      continue;
    }

    const codes = match[1]
      ? match[1].split(';').map((value) => Number(value))
      : [0];

    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      if (Number.isNaN(code)) continue;
      if (code === 0) {
        style = {};
        continue;
      }
      if (code === 1) {
        style.bold = true;
        continue;
      }
      if (code === 2) {
        style.dim = true;
        continue;
      }
      if (code === 22) {
        style.bold = false;
        style.dim = false;
        continue;
      }
      if (code === 39) {
        delete style.color;
        continue;
      }
      if (code === 49) {
        delete style.backgroundColor;
        continue;
      }

      if (code === 38 || code === 48) {
        const mode = codes[i + 1];
        if (mode === 5) {
          const colorIndex = codes[i + 2];
          const color = xtermColor(colorIndex);
          if (color) {
            if (code === 38) style.color = color;
            else style.backgroundColor = color;
          }
          i += 2;
          continue;
        }
        if (mode === 2) {
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          if ([r, g, b].every((v) => Number.isFinite(v))) {
            const color = rgbToHex(r, g, b);
            if (code === 38) style.color = color;
            else style.backgroundColor = color;
          }
          i += 4;
          continue;
        }
        continue;
      }

      const color = applyColorFromCode(code);
      if (color) {
        if (code >= 40) style.backgroundColor = color;
        else style.color = color;
      }
    }
  }

  return segments;
}
