// A small, valid three-page PDF. Offsets are calculated so pdf-parse and
// PDF.js both read the same bytes through the actual upload/storage path.
export function readingPdf(pageCount = 3, bodyForPage?: (page: number) => string[]) {
  const fontId = 3 + pageCount * 2
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`).join(' ')
  const escape = (text: string) => text.replace(/[()\\]/g, '\\$&')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  ]
  for (let i = 0; i < pageCount; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`)
    const lines = bodyForPage?.(i + 1) ?? ['A small document for testing bookmarks and saved reading position.']
    const body = lines.map((line) => `0 -18 Td (${escape(line)}) Tj`).join(' ')
    const stream = `BT /F1 18 Tf 50 700 Td (Reading fixture page ${i + 1}) Tj /F1 12 Tf ${body} ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let result = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(result.length); result += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = result.length
  result += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { result += `${String(offset).padStart(10, '0')} 00000 n \n` })
  result += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(result)
}

