/** 数値を日本語の桁区切りで表示する（値がなければ「−」） */
export const fmt = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '−'
    : v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
