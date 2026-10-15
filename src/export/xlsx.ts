/**
 * Excel（.xlsx）出力（F-8-4）。ブラウザ内で生成する（F-8-8）。ExcelJS は使うときに読み込む（初回表示を軽くするため）。
 */
import type { Sheet } from './results'

export async function sheetsToXlsx(sheets: Sheet[]): Promise<Blob> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = '自動運転バス 収入予測ツール'
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name)
    sheet.rows.forEach((row, i) => {
      const r = ws.addRow(row.map((v) => v ?? null))
      if (sheet.headerRows.includes(i)) {
        r.font = { bold: true }
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
      }
    })
    // 列幅：内容に合わせる（長い文章は折り返し）
    const width = Math.max(...sheet.rows.map((r) => r.length), 1)
    for (let c = 1; c <= width; c++) {
      const longest = Math.max(
        8,
        ...sheet.rows.map((r) => {
          const v = r[c - 1]
          return v === null || v === undefined ? 0 : String(v).length * (c === 1 ? 1.6 : 1.3)
        }),
      )
      ws.getColumn(c).width = Math.min(60, longest)
      ws.getColumn(c).alignment = { vertical: 'top', wrapText: true }
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
