import { Modal } from './Modal'
import { useNotice } from './notice'

export function NoticeDialog() {
  const notice = useNotice((s) => s.notice)
  const close = useNotice((s) => s.close)
  if (!notice) return null
  return (
    <Modal
      title={notice.title}
      tone={notice.kind}
      onClose={close}
      actions={
        <button type="button" className="btn btn-primary" onClick={close} autoFocus>
          閉じる
        </button>
      }
    >
      <ul className="notice-list">
        {notice.messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </Modal>
  )
}
