/**
 * ブラウザ内で作ったファイルをダウンロードさせる（サーバへは送信しない。F-8-8）。
 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // ダウンロード開始前に解放しないよう少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(fileName: string, text: string, mimeType: string): void {
  downloadBlob(fileName, new Blob([text], { type: mimeType }))
}
