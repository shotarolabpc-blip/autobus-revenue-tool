import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { openFileWithNotice } from '../project/openWithNotice'

/** 画面のどこにファイルをドロップしても読み込めるようにする（F-1-4） */
export function FileDropZone() {
  const [over, setOver] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const file = e.dataTransfer?.files[0]
      // GeoJSON・CSV などは各画面が受け取る。プロジェクトファイルだけをここで扱う
      if (!file || !/\.json$/i.test(file.name)) return
      if ((e.target as HTMLElement | null)?.closest?.('[data-own-drop]')) return
      openFileWithNotice(file).then((ok) => ok && navigate('/project'))
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [navigate])

  if (!over) return null
  return (
    <div className="drop-overlay" aria-hidden="true">
      プロジェクトファイル（.busproj.json）をここにドロップして開く
    </div>
  )
}
