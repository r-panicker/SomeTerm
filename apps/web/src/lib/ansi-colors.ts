import { RGB_FLAG, type AnsiColor } from '@superserial/core';

// The 16 base colours are tuned per theme so that, for example, yellow stays
// readable on a white background and black stays visible on a dark one.
const LIGHT = ['#1d1d1f', '#c4291c', '#1a7f37', '#9a6700', '#1f5fd6', '#a2318f', '#0b7a8a', '#6b6b73',
  '#6b6b73', '#e5463a', '#2da44e', '#bf8700', '#3b82f6', '#c43fae', '#1497a8', '#1d1d1f'];
const DARK = ['#5c5c66', '#ff6b5e', '#4ade80', '#facc15', '#60a5fa', '#e879f9', '#22d3ee', '#d4d4d8',
  '#8b8b94', '#ff8a80', '#86efac', '#fde047', '#93c5fd', '#f0abfc', '#67e8f9', '#ffffff'];

const CUBE = [0, 95, 135, 175, 215, 255];
const hex = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;

export function ansiColor(c: AnsiColor, dark: boolean): string {
  if (c >= RGB_FLAG) return hex((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
  if (c < 16) return (dark ? DARK : LIGHT)[c]!;
  if (c < 232) {
    const i = c - 16;
    return hex(CUBE[Math.floor(i / 36)]!, CUBE[Math.floor(i / 6) % 6]!, CUBE[i % 6]!);
  }
  const g = 8 + (c - 232) * 10;
  return hex(g, g, g);
}
