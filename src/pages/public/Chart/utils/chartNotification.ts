export function notifyChart(title: string, message: string, color: string): void {
  window.dispatchEvent(
    new CustomEvent("maimai-chart-notify", { detail: { title, message, color } }),
  );
}
