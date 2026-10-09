import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="page">
      <h2>ページが見つかりません</h2>
      <p>
        <Link to="/map">地図の画面へ戻る</Link>
      </p>
    </section>
  )
}
