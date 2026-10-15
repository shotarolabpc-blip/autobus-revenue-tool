import { useState } from 'react'
import { AGE_CLASSES_7, groupPopulation } from '../../calc/ageClasses'
import { stopAnnualRiders, type ScenarioResult } from '../../calc/pipeline'
import { fmt } from '../../util/format'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

/**
 * 「なぜこの人数か」を確かめるための内訳（5.1）。
 * 年度を選ぶと、バス停ごと・年齢区分ごとに「人口×外出率×トリップ数×バス分担率」の各項を見られる。
 */
export function Breakdown({ result }: { result: ScenarioResult }) {
  const [yearIndex, setYearIndex] = useState(0)
  const d = result.demand[Math.min(yearIndex, result.demand.length - 1)]
  if (!d) return null
  const factor = d.serviceFactor * d.fareFactor * d.rampUp * d.scenarioFactor
  const pct = (v: number) => `${fmt(v * 100, 2)}%`
  const name = (id: string) => result.stopNames.get(id) ?? id
  return (
    <div className="card">
      <h3>計算の内訳（なぜこの人数か）</h3>
      <label className="field field-compact">
        <span>年度</span>
        <select
          aria-label="内訳を見る年度"
          value={yearIndex}
          onChange={(e) => setYearIndex(Number(e.target.value))}
        >
          {result.demand.map((y, i) => (
            <option key={y.fiscalYear} value={i}>
              {y.fiscalYear}年度
            </option>
          ))}
        </select>
      </label>

      <h4>1. バス停ごとの勢圏人口</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="バス停ごとの勢圏人口">
          <thead>
            <tr>
              <th>バス停</th>
              <th className="num">合計</th>
              <th className="num">0〜14歳</th>
              <th className="num">15〜64歳</th>
              <th className="num">65〜74歳</th>
              <th className="num">75歳以上</th>
              <th className="num">うち開発計画</th>
              <th className="num">年間の延べ乗車人員</th>
            </tr>
          </thead>
          <tbody>
            {d.stops.map((s) => {
              const g = groupPopulation(s.pop)
              return (
                <tr key={s.stopId}>
                  <td>{name(s.stopId)}</td>
                  <td className="num">{fmt(sum(s.pop), 1)}</td>
                  <td className="num">{fmt(g['0-14'], 1)}</td>
                  <td className="num">{fmt(g['15-64'], 1)}</td>
                  <td className="num">{fmt(g['65-74'], 1)}</td>
                  <td className="num">{fmt(g['75+'], 1)}</td>
                  <td className="num">{fmt(sum(s.development), 1)}</td>
                  <td className="num">{fmt(stopAnnualRiders(d, s.stopId))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        勢圏と人口メッシュの重なりの面積で人口を按分しています。勢圏が重なる部分は、いちばん近いバス停に数えて二重計上を避けています。
        バス停別の延べ乗車人員には、施設等の外部需要は含めていません。
      </p>

      <h4>2. 年齢区分ごとの1日の延べ乗車人員（補正前）</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="年齢区分ごとの内訳">
          <thead>
            <tr>
              <th rowSpan={2}>バス停</th>
              <th rowSpan={2}>年齢区分</th>
              <th rowSpan={2} className="num">
                勢圏人口
              </th>
              <th colSpan={4}>平日</th>
              <th colSpan={4}>土休日</th>
            </tr>
            <tr>
              <th className="num">外出率</th>
              <th className="num">トリップ数</th>
              <th className="num">バス分担率</th>
              <th className="num">人/日</th>
              <th className="num">外出率</th>
              <th className="num">トリップ数</th>
              <th className="num">バス分担率</th>
              <th className="num">人/日</th>
            </tr>
          </thead>
          <tbody>
            {d.stops.flatMap((s) =>
              AGE_CLASSES_7.map((age) => {
                const w = d.terms.find(
                  (t) => t.stopId === s.stopId && t.age === age && t.dayType === 'weekday',
                )
                const h = d.terms.find(
                  (t) => t.stopId === s.stopId && t.age === age && t.dayType === 'holiday',
                )
                if (!w || !h) return null
                return (
                  <tr key={`${s.stopId}-${age}`}>
                    <td>{name(s.stopId)}</td>
                    <td>{age}歳</td>
                    <td className="num">{fmt(w.population, 1)}</td>
                    <td className="num">{pct(w.outingRate)}</td>
                    <td className="num">{fmt(w.tripRate, 2)}</td>
                    <td className="num">{pct(w.busShare)}</td>
                    <td className="num">{fmt(w.dailyBase, 2)}</td>
                    <td className="num">{pct(h.outingRate)}</td>
                    <td className="num">{fmt(h.tripRate, 2)}</td>
                    <td className="num">{pct(h.busShare)}</td>
                    <td className="num">{fmt(h.dailyBase, 2)}</td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>
      <p className="hint">
        各行は「勢圏人口 × 外出率 × 1日トリップ数 × バス分担率 × 路線捕捉率（
        {fmt(result.captureRate, 2)}
        ）」です。 都市類型：{result.cityType.name}。0〜4歳の係数は暫定で5〜14歳の値です（確認事項
        Q2）。
      </p>

      <h4>3. 補正と年間への換算</h4>
      <table className="table" aria-label="補正と年間への換算">
        <thead>
          <tr>
            <th>項目</th>
            <th className="num">平日</th>
            <th className="num">土休日</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1日の延べ乗車人員（補正前・住民）</td>
            <td className="num">{fmt(d.dailyBase.weekday, 2)}</td>
            <td className="num">{fmt(d.dailyBase.holiday, 2)}</td>
          </tr>
          <tr>
            <td>
              × 補正係数（運行サービス {fmt(d.serviceFactor, 2)} × 運賃 {fmt(d.fareFactor, 3)} ×
              立ち上がり {fmt(d.rampUp, 2)} × シナリオ {fmt(d.scenarioFactor, 2)}＝{fmt(factor, 3)}
              ）
            </td>
            <td className="num">{fmt(d.dailyBase.weekday * factor, 2)}</td>
            <td className="num">{fmt(d.dailyBase.holiday * factor, 2)}</td>
          </tr>
          <tr>
            <td>＋ 施設等の外部需要</td>
            <td className="num">{fmt(d.dailyFacility.weekday, 2)}</td>
            <td className="num">{fmt(d.dailyFacility.holiday, 2)}</td>
          </tr>
          <tr>
            <td>＝ 需要（頭打ち前）</td>
            <td className="num">{fmt(d.dailyDemand.weekday, 2)}</td>
            <td className="num">{fmt(d.dailyDemand.holiday, 2)}</td>
          </tr>
          <tr>
            <td>1日の輸送力</td>
            <td className="num">
              {d.dailyCapacity.weekday === null ? '未設定' : fmt(d.dailyCapacity.weekday, 1)}
            </td>
            <td className="num">
              {d.dailyCapacity.holiday === null ? '未設定' : fmt(d.dailyCapacity.holiday, 1)}
            </td>
          </tr>
          <tr>
            <td>＝ 1日の延べ乗車人員（頭打ち後）</td>
            <td className="num">{fmt(d.dailyRiders.weekday, 2)}</td>
            <td className="num">{fmt(d.dailyRiders.holiday, 2)}</td>
          </tr>
          <tr>
            <td>× 年間運行日数</td>
            <td className="num">{d.days.weekday}</td>
            <td className="num">{d.days.holiday}</td>
          </tr>
          <tr>
            <th>＝ 年間の延べ乗車人員</th>
            <th className="num" colSpan={2}>
              {fmt(d.totalAnnual)} 人（住民 {fmt(d.residentsAnnual)}・施設等 {fmt(d.facilityAnnual)}
              ）
            </th>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
