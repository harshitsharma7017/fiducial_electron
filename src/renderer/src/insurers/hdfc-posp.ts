// The advisor's SP/POSP name or code, which HDFC ERGO's PIE asks of the intermediary on its retail
// health forms. It is the advisor's, not a client's: kept on this computer, the same for every
// client (entered in a client's Additional details, HDFC ERGO).
const POSP_KEY = 'fqf.hdfc.posp';

export function rememberedPosp(): string {
  try {
    return localStorage.getItem(POSP_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberPosp(value: string): void {
  try {
    localStorage.setItem(POSP_KEY, value);
  } catch {
    // Not kept: asked again next time.
  }
}
