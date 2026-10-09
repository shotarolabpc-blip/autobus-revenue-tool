/** 先頭の BOM（Excel などで保存したファイル対策） */
const BOM = String.fromCharCode(0xfeff)

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text
}

/** Excel で文字化けしない UTF-8 の CSV にするため、先頭に BOM を付ける */
export function withBom(text: string): string {
  return BOM + text
}
