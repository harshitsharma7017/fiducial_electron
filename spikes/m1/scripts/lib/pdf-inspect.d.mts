export interface PdfInspection {
  numPages: number;
  text: string;
  items: { str: string; fontName: string }[];
  fonts: Record<string, { name: string; embedded: boolean }>;
}

export function inspectPdf(path: string): Promise<PdfInspection>;
