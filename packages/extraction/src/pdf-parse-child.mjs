import { extractText, getDocumentProxy } from "unpdf";

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error("input too large");
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const result = await extractText(pdf, { mergePages: false });
  const texts = Array.isArray(result.text) ? result.text : [String(result.text)];
  const pages = texts.map((text, index) => ({
    pageNumber: index + 1,
    text: typeof text === "string" ? text.slice(0, 500_000) : ""
  }));
  process.stdout.write(JSON.stringify({ pages }));
}

main().catch((error) => {
  process.stderr.write(`pdf-parse-failed: ${error instanceof Error ? error.message : "unknown"}`);
  process.exit(1);
});
