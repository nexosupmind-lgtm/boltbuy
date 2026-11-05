// A4 vector PDF, generated locally. Optional JPEG logo; no remote PDF service.
const bytes = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 255));
const ascii = (s) =>
  String(s ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\xff\n]/g, "");
const literal = (s) =>
  ascii(s)
    .replace(/[\\()]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
const currency = (n) =>
  Number(n)
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/\u00a0/g, " ");
const wrap = (text, width, size) => {
  const result = [];
  for (const paragraph of ascii(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if ((line + " " + word).length * size * 0.53 > width && line) {
        result.push(line);
        line = "";
      }
      if (word.length * size * 0.53 > width) {
        const max = Math.floor(width / (size * 0.53));
        for (let i = 0; i < word.length; i += max)
          result.push(word.slice(i, i + max));
      } else line += (line ? " " : "") + word;
    }
    if (line) result.push(line);
  }
  return result;
};
export function quotePDF(quote, store, logo) {
  const W = 595.28,
    H = 841.89,
    margin = 36,
    objects = [],
    pages = [];
  const reserve = () => {
    objects.push(null);
    return objects.length;
  };
  const put = (value) => {
    objects.push(value);
    return objects.length;
  };
  const catalog = reserve(),
    pagesId = reserve();
  const regular = put(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
    bold = put(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
  let logoId;
  if (logo?.data?.length && logo.width && logo.height)
    logoId = put([
      bytes(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`,
      ),
      logo.data,
      bytes("\nendstream"),
    ]);
  const color = /^#[\da-f]{6}$/i.test(store.color || "")
    ? [1, 3, 5].map((i) => parseInt(store.color.slice(i, i + 2), 16) / 255)
    : [0.16, 0.2, 0.3];
  let commands = "",
    y = 0,
    page = 0;
  const text = (
    s,
    x,
    top,
    size = 11,
    weight = false,
    c = [0.14, 0.19, 0.28],
  ) => {
    commands += `BT /${weight ? "B" : "R"} ${size} Tf ${c.join(" ")} rg 1 0 0 1 ${x} ${H - top} Tm (${literal(s)}) Tj ET\n`;
  };
  const rect = (x, top, w, h, c) => {
    commands += `${c.join(" ")} rg ${x} ${H - top - h} ${w} ${h} re f\n`;
  };
  function finish() {
    if (!commands) return;
    text(
      "ORÇAMENTO COMERCIAL  |  " + (store.name || ""),
      margin,
      807,
      8,
      false,
      [0.4, 0.45, 0.53],
    );
    text("Página " + page, 505, 807, 8, false, [0.4, 0.45, 0.53]);
    const content = bytes(commands),
      stream = put([
        bytes(`<< /Length ${content.length} >>\nstream\n`),
        content,
        bytes("\nendstream"),
      ]);
    pages.push(
      put(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /R ${regular} 0 R /B ${bold} 0 R >> ${logoId ? `/XObject << /Logo ${logoId} 0 R >>` : ""} >> /Contents ${stream} 0 R >>`,
      ),
    );
    commands = "";
  }
  function begin() {
    finish();
    page++;
    rect(0, 0, W, 106, color);
    text("ORÇAMENTO", margin, 44, 22, true, [1, 1, 1]);
    text((store.name || "").slice(0, 48), margin, 68, 12, true, [1, 1, 1]);
    text(
      "Nº " +
        quote.id.slice(0, 8).toUpperCase() +
        "  |  " +
        new Date(quote.date).toLocaleDateString("pt-BR"),
      margin,
      90,
      9,
      false,
      [1, 1, 1],
    );
    if (logoId) {
      const scale = Math.min(125 / logo.width, 70 / logo.height);
      commands += `q ${logo.width * scale} 0 0 ${logo.height * scale} ${W - margin - logo.width * scale} ${H - 20 - logo.height * scale} cm /Logo Do Q\n`;
    }
    y = 135;
  }
  const ensure = (h) => {
    if (y + h > 770) {
      begin();
    }
  };
  const paragraph = (label, value) => {
    if (!value) return;
    const lines = wrap(value, 515, 11);
    ensure(24 + lines.length * 16);
    text(label, margin, y, 9, true, [0.42, 0.47, 0.55]);
    y += 18;
    for (const line of lines) {
      text(line, margin, y);
      y += 16;
    }
    y += 12;
  };
  const tableHead = () => {
    ensure(32);
    rect(margin, y, 523, 27, [0.94, 0.95, 0.97]);
    text("DESCRIÇÃO", margin + 10, y + 18, 9, true);
    text("QTD.", quote.showPrices ? 370 : 501, y + 18, 9, true);
    if (quote.showPrices) {
      text("UNIT.", 425, y + 18, 9, true);
      text("VALOR", 500, y + 18, 9, true);
    }
    y += 38;
  };
  begin();
  paragraph("PREPARADO PARA", quote.customer);
  paragraph("CONTATO", quote.phone);
  paragraph("EVENTO / ENTREGA", quote.event);
  if (quote.validUntil)
    paragraph(
      "VALIDADE DO ORÇAMENTO",
      quote.validUntil.split("-").reverse().join("/"),
    );
  tableHead();
  for (const item of quote.items) {
    const lines = wrap(item.name, quote.showPrices ? 310 : 435, 11),
      height = Math.max(35, lines.length * 16 + 15);
    if (y + height > 748) {
      begin();
      tableHead();
    }
    for (let i = 0; i < lines.length; i++) {
      ensure(22);
      text(lines[i], margin + 10, y + 12);
      if (i === 0) {
        text(String(item.qty), quote.showPrices ? 376 : 509, y + 12, 11, true);
        if (quote.showPrices) {
          text(currency(item.price), 416, y + 12, 9);
          text(currency(item.price * item.qty), 491, y + 12, 9, true);
        }
      }
      y += 16;
    }
    y += 12;
    rect(margin, y, 523, 0.6, [0.89, 0.91, 0.94]);
    y += 12;
  }
  ensure(96);
  y += 12;
  rect(margin, y, 523, 73, [0.95, 0.96, 0.98]);
  text("INVESTIMENTO TOTAL", margin + 16, y + 25, 10, true);
  text(currency(quote.total), margin + 16, y + 54, 24, true, color);
  y += 100;
  paragraph("OBSERVAÇÕES E CONDIÇÕES", quote.notes);
  paragraph("FALE COM A LOJA", store.phone);
  finish();
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((id) => id + " 0 R").join(" ")}] >>`;
  const chunks = [bytes("%PDF-1.4\n%âãÏÓ\n")],
    offsets = [0];
  let length = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(length);
    const value = Array.isArray(objects[i]) ? objects[i] : [bytes(objects[i])],
      parts = [bytes(`${i + 1} 0 obj\n`), ...value, bytes("\nendobj\n")];
    for (const part of parts) {
      chunks.push(part);
      length += part.length;
    }
  }
  const xref = length;
  chunks.push(
    bytes(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n ")
        .join(
          "\n",
        )}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  const output = new Uint8Array(chunks.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
