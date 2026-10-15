import { forwardRef } from 'react'
import { niceTicks } from './chartUtil'

export type ChartSeries = { name: string; color: string; values: number[] }

type Props = {
  title: string
  unit: string
  years: number[]
  series: ChartSeries[]
  /** 画像（PNG）の下端に入れる注記（出典・シナリオ名・推計日時など） */
  footnote?: string
}

const W = 720
const H = 360
const M = { top: 44, right: 24, bottom: 78, left: 78 }

const compact = (v: number) =>
  Math.abs(v) >= 1e8
    ? `${(v / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}億`
    : Math.abs(v) >= 1e4
      ? `${(v / 1e4).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万`
      : v.toLocaleString('ja-JP')

/** 年度別の折れ線グラフ（SVG。PNG出力できるよう、色・文字は属性で直接指定） */
export const SeriesChart = forwardRef<SVGSVGElement, Props>(function SeriesChart(
  { title, unit, years, series, footnote },
  ref,
) {
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const x = (i: number) =>
    M.left +
    (years.length <= 1
      ? (W - M.left - M.right) / 2
      : (i / (years.length - 1)) * (W - M.left - M.right))
  const y = (v: number) => M.top + (1 - v / top) * (H - M.top - M.bottom)
  const everyN = Math.ceil(years.length / 10)
  const label = (v: number) => (unit === '円' ? compact(v) : v.toLocaleString('ja-JP'))
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${title}（単位：${unit}）。${series.map((s) => s.name).join('、')}`}
      style={{ width: '100%', height: 'auto', maxWidth: W, background: '#ffffff' }}
      fontFamily="'Hiragino Sans','Yu Gothic UI',Meiryo,sans-serif"
    >
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text x={M.left} y={22} fontSize={15} fontWeight={700} fill="#1f2937">
        {title}
      </text>
      <text x={M.left} y={38} fontSize={11} fill="#6b7280">
        単位：{unit}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
          <text x={M.left - 8} y={y(t) + 4} fontSize={11} textAnchor="end" fill="#4b5563">
            {label(t)}
          </text>
        </g>
      ))}
      {years.map((yr, i) =>
        i % everyN === 0 ? (
          <text
            key={yr}
            x={x(i)}
            y={H - M.bottom + 18}
            fontSize={11}
            textAnchor="middle"
            fill="#4b5563"
          >
            {yr}
          </text>
        ) : null,
      )}
      <text
        x={(M.left + W - M.right) / 2}
        y={H - M.bottom + 34}
        fontSize={11}
        textAnchor="middle"
        fill="#6b7280"
      >
        年度
      </text>
      {series.map((s) => (
        <g key={s.name}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
          {s.values.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={3.5}
              fill={s.color}
              stroke="#ffffff"
              strokeWidth={1}
            >
              <title>{`${s.name} ${years[i]}年度：${v.toLocaleString('ja-JP', { maximumFractionDigits: 0 })} ${unit}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {series.map((s, k) => (
        <g key={s.name} transform={`translate(${M.left + k * 170},${H - 30})`}>
          <line x1={0} x2={22} y1={0} y2={0} stroke={s.color} strokeWidth={2.5} />
          <circle cx={11} cy={0} r={3.5} fill={s.color} />
          <text x={28} y={4} fontSize={11} fill="#1f2937">
            {s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name}
          </text>
        </g>
      ))}
      {footnote && (
        <text x={M.left} y={H - 8} fontSize={9} fill="#6b7280">
          {footnote}
        </text>
      )}
    </svg>
  )
})
