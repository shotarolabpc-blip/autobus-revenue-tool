import { baselineRows, type BaselineProps as Props } from './baselineRows'

export function BaselineTable(props: Props) {
  const rows = baselineRows(props)
  return (
    <div className="card">
      <h3>初期値と根拠</h3>
      <p className="hint">
        このツールが最初から使っている値と、その根拠です。根拠のない値は、既定では計算に効かせていません。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="初期値と根拠">
          <thead>
            <tr>
              <th>項目</th>
              <th>初期値</th>
              <th>根拠</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td>{r.value}</td>
                <td>{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
