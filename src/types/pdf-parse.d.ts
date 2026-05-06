// pdf-parse ships its main entry as `index.js` which runs a debug harness when
// `require.main === module`; the bundler trips on it. Importing the lib subpath
// avoids that, but the package only ships types for the main entry, so we
// declare the subpath here.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
