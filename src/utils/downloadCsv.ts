export function downloadCsv(csv: string, originalFileName: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const baseName = originalFileName.replace(/\.[^/.]+$/, "");

  anchor.href = url;
  anchor.download = `${baseName}_converted.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
