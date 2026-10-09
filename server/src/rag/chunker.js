// Splits a markdown document into chunks that keep their heading for context.
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

export function chunkDocument(title, markdown, { maxWords = 140 } = {}) {
  const sections = [];
  let heading = title;
  let paragraphs = [];

  const flush = () => {
    if (paragraphs.length) sections.push({ heading, paragraphs });
    paragraphs = [];
  };

  for (const block of markdown.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const text = block.trim();
    if (!text) continue;
    const h = text.match(/^#{1,4}\s+(.+)$/m);
    if (h && text.startsWith("#")) {
      flush();
      heading = `${title} > ${h[1].trim()}`;
      const rest = text.replace(/^#{1,4}\s+.+\n?/, "").trim();
      if (rest) paragraphs.push(rest);
    } else {
      paragraphs.push(text);
    }
  }
  flush();

  const chunks = [];
  for (const section of sections) {
    let current = [];
    let words = 0;
    const push = () => {
      if (!current.length) return;
      chunks.push({ heading: section.heading, text: `${section.heading}\n${current.join("\n\n")}` });
      current = [];
      words = 0;
    };
    for (const p of section.paragraphs) {
      const w = wordCount(p);
      if (words + w > maxWords && current.length) push();
      current.push(p);
      words += w;
    }
    push();
  }
  return chunks.map((c, index) => ({ ...c, index }));
}
