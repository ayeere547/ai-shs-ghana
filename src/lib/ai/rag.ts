/**
 * Knowledge-base helpers. Chunking is pure (unit-tested); retrieval runs under the caller's RLS.
 */
export type Chunk = { index: number; heading: string | null; content: string };

const HEADING = /^(#{1,4}\s+.+|[A-Z0-9][A-Z0-9 ,:'()&-]{3,80}|(?:\d+(?:\.\d+)*|[IVX]+)\.?\s+[A-Z].{2,80})$/;

/** Splits a document into ~target-sized chunks along paragraph boundaries, carrying the nearest heading. */
export function chunkText(text: string, { target = 1200, max = 2000, overlap = 150 } = {}): Chunk[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let buffer = "";
  let bufferHeading: string | null = null;

  const push = () => {
    const content = buffer.trim();
    if (content) chunks.push({ index: chunks.length, heading: bufferHeading, content });
    buffer = content.length > overlap ? content.slice(-overlap).replace(/^\S*\s/, "") : "";
  };

  for (const para of paragraphs) {
    const firstLine = para.split("\n")[0].trim();
    if (HEADING.test(firstLine) && firstLine.length <= 90) {
      if (buffer.trim().length > overlap) push();
      heading = firstLine.replace(/^#+\s*/, "");
      buffer = "";
      const rest = para.split("\n").slice(1).join("\n").trim();
      if (!rest) continue;
      bufferHeading = heading;
      buffer = rest;
      continue;
    }
    // Hard-split very long paragraphs on sentence boundaries.
    const pieces = para.length > max ? para.match(new RegExp(`[^.!?]{1,${max}}[.!?]*`, "g")) ?? [para] : [para];
    for (const piece of pieces) {
      if (buffer && buffer.length + piece.length + 2 > target) push();
      if (!buffer) bufferHeading = heading;
      buffer = buffer ? `${buffer}\n\n${piece.trim()}` : piece.trim();
    }
  }
  if (buffer.trim()) {
    const content = buffer.trim();
    const last = chunks[chunks.length - 1];
    if (!last || !last.content.endsWith(content)) chunks.push({ index: chunks.length, heading: bufferHeading, content });
  }
  return chunks.map((c) => ({ ...c, content: c.content.slice(0, 7900) }));
}

/** Extracts text from an uploaded knowledge file (PDF, plain text or Markdown). */
export async function extractText(file: File): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { extractText: pdf, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await pdf(doc, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  return await file.text();
}
