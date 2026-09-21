export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  let value = sizeBytes / 1024;
  let unit: "KB" | "MB" = "KB";
  if (value >= 1024) {
    value /= 1024;
    unit = "MB";
  }
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}
