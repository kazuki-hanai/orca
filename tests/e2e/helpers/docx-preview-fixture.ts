import { strToU8, zipSync } from 'fflate'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function paragraph(text: string, runProperties = ''): string {
  return `<w:p><w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function tableRow(cells: string[]): string {
  return `<w:tr>${cells.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`
}

/** A minimal Word document: a title, body text, an external link, a table and a second page. */
export function createDocxPreviewFixture({ linkUrl }: { linkUrl: string }): Buffer {
  const body = [
    paragraph('Quarterly report', '<w:b/><w:sz w:val="40"/>'),
    paragraph('Revenue grew in every region this quarter.'),
    `<w:p><w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Open the full report</w:t></w:r></w:hyperlink></w:p>`,
    `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${tableRow(['Region', 'Revenue'])}${tableRow(['North', '120'])}${tableRow(['South', '95'])}</w:tbl>`,
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    paragraph('Appendix on the second page')
  ].join('')
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
      'word/document.xml': strToU8(document),
      'word/_rels/document.xml.rels': strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${linkUrl}" TargetMode="External"/></Relationships>`
      )
    })
  )
}
