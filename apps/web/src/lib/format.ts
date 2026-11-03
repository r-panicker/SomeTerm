export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1 << 20) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1 << 20)).toFixed(2)} MB`;
}
