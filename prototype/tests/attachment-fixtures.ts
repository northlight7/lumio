import { crc32, deflateRawSync } from 'node:zlib'
export function officeZip(files:Record<string,string>,options:{encrypted?:boolean;declaredSize?:number}={}):Buffer {
  const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0
  for(const [name,body] of Object.entries(files)){
    const file=Buffer.from(name),bytes=Buffer.from(body),compressed=deflateRawSync(bytes),crc=crc32(bytes)
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(options.encrypted?1:0,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(options.declaredSize||bytes.length,22);local.writeUInt16LE(file.length,26)
    locals.push(local,file,compressed)
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(options.encrypted?1:0,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(options.declaredSize||bytes.length,24);central.writeUInt16LE(file.length,28);central.writeUInt32LE(offset,42)
    centrals.push(central,file);offset+=local.length+file.length+compressed.length
  }
  const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,directory,end])
}
const types=(type:string)=>`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/main.xml" ContentType="application/vnd.openxmlformats-officedocument.${type}.main+xml"/></Types>`
export const docxFiles={
  '[Content_Types].xml':types('wordprocessingml.document'),
  'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The supplied evidence supports this practical recommendation. Verify the stated assumptions and explain the uncertainty before handover.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Owner: analyst</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
}
export const xlsxFiles={
  '[Content_Types].xml':types('spreadsheetml.sheet'),
  'xl/workbook.xml':'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml':'<sst><si><t>Evidence reviewed, denominator verified, missing records explained and the proposed next check assigned to the analyst.</t></si></sst>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12</v></c><c r="C1"><f>B1/2</f><v>6</v></c></row></sheetData></worksheet>'
}
export const pptxFiles={
  '[Content_Types].xml':types('presentationml.presentation'),
  'ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
  'ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
  'ppt/slides/slide1.xml':'<sld><p><t>Second slide explains the verification owner and limitations.</t></p></sld>',
  'ppt/slides/slide2.xml':'<sld><p><t>First slide explains the evidence, calculation and practical next steps for the supplied scenario.</t></p></sld>'
}
