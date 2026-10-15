import { CAPTURE_LABELS, type ScenarioResult } from '../../calc/pipeline'
import { operatorsOf } from '../../gis/overlap'
import type { Scenario, StopCapture } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'
import { NumField } from '../fields'

type Props = { scenario: Scenario; result: ScenarioResult | null; disabled: boolean }

const blank = (stopId: string): StopCapture => ({
  stopId,
  mode: 'trips',
  existingWeekdayTrips: 0,
  existingHolidayTrips: 0,
  rate: 1,
})

/**
 * 路線捕捉率（確認事項 Q5）。勢圏の中に既存のバス停があるバス停では、次のどちらかを選ぶ。
 *  1. 重なる既存路線の便数を入力して按分：捕捉率＝本路線の便数÷（本路線の便数＋既存路線の便数の合計）。平日と土休日で別々
 *  2. 捕捉率を直接入力
 * どちらも選ばないあいだは「捕捉率 未設定」と表示し、計算は100%にする（既存路線にも乗れる人がいるため、需要は多めに出る）。
 */
export function CaptureSection({ scenario, result, disabled }: Props) {
  const set = (stopId: string, patch: Partial<StopCapture> | null) =>
    useProjectStore.getState().updateScenario(scenario.id, (s) => {
      const rest = s.stopCapture.filter((x) => x.stopId !== stopId)
      if (patch === null) return { ...s, stopCapture: rest }
      const cur = s.stopCapture.find((x) => x.stopId === stopId) ?? blank(stopId)
      return { ...s, stopCapture: [...rest, { ...cur, ...patch }] }
    })
  const rows = (result?.captures ?? []).filter(
    (c) => c.existing.length > 0 || scenario.stopCapture.some((x) => x.stopId === c.stopId),
  )
  const own = { weekday: scenario.service.weekdayTrips, holiday: scenario.service.holidayTrips }

  return (
    <div className="card">
      <h3>路線捕捉率（既存のバス路線と重なるバス停）</h3>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <p className="hint">
          勢圏の中に既存のバス停があると、その路線にも乗れる人がいるため、本路線を使う割合（路線捕捉率）を入れないと、延べ乗車人員を多く見積もります。
          国土数値情報のバス路線データには運行本数がないため、便数は入力が必要です。
          どちらも選ばないあいだは「未設定」と表示し、計算は100%で行います。
        </p>
        {!result || result.blocked ? (
          <p className="hint">バス停を置いて、運行計画を入れると、ここに重なるバス停が出ます。</p>
        ) : rows.length === 0 ? (
          <p>勢圏の中に既存のバス停があるバス停はありません（捕捉率は100%）。</p>
        ) : (
          rows.map((c) => {
            const cur = scenario.stopCapture.find((x) => x.stopId === c.stopId) ?? null
            return (
              <div key={c.stopId} className="card">
                <strong>バス停「{c.name}」</strong>
                <div className="hint">
                  勢圏の中の既存バス停：{c.existing.length}か所（
                  {operatorsOf(c.existing).join('、') || '−'}）
                  {c.existing
                    .slice(0, 4)
                    .map((e) => e.name)
                    .join('、')}
                  {c.existing.length > 4 ? ' ほか' : ''}
                </div>
                <div
                  className="radio-group"
                  role="radiogroup"
                  aria-label={`${c.name}の捕捉率の決め方`}
                >
                  <label className="inline-radio">
                    <input
                      type="radio"
                      name={`cap-${c.stopId}`}
                      checked={cur === null}
                      onChange={() => set(c.stopId, null)}
                    />
                    未設定
                  </label>
                  <label className="inline-radio">
                    <input
                      type="radio"
                      name={`cap-${c.stopId}`}
                      checked={cur?.mode === 'trips'}
                      onChange={() => set(c.stopId, { mode: 'trips' })}
                    />
                    既存路線の便数を入力して按分
                  </label>
                  <label className="inline-radio">
                    <input
                      type="radio"
                      name={`cap-${c.stopId}`}
                      checked={cur?.mode === 'direct'}
                      onChange={() => set(c.stopId, { mode: 'direct' })}
                    />
                    捕捉率を直接入力
                  </label>
                </div>
                {cur?.mode === 'trips' && (
                  <>
                    <div className="field-grid">
                      <NumField
                        label="重なる既存路線の便数の合計（平日）"
                        unit="便/日"
                        value={cur.existingWeekdayTrips}
                        onChange={(v) => set(c.stopId, { existingWeekdayTrips: v ?? 0 })}
                      />
                      <NumField
                        label="重なる既存路線の便数の合計（土休日）"
                        unit="便/日"
                        value={cur.existingHolidayTrips}
                        onChange={(v) => set(c.stopId, { existingHolidayTrips: v ?? 0 })}
                      />
                    </div>
                    <p className="hint">
                      本路線の便数（「運行・運賃」画面の入力）：平日 {own.weekday}・土休日{' '}
                      {own.holiday}。
                      捕捉率＝本路線の便数÷（本路線の便数＋既存路線の便数の合計）。複数の既存路線があるときは、便数を合計して入力してください。
                    </p>
                  </>
                )}
                {cur?.mode === 'direct' && (
                  <NumField
                    label="路線捕捉率"
                    unit="%"
                    min={0}
                    max={100}
                    value={Math.round(cur.rate * 10000) / 100}
                    onChange={(v) => set(c.stopId, { rate: (v ?? 0) / 100 })}
                  />
                )}
                <div className="hint">
                  現在の捕捉率：
                  {c.status === 'unset'
                    ? '未設定（計算は100%）'
                    : `平日 ${fmt(c.weekday * 100, 1)}%／土休日 ${fmt(c.holiday * 100, 1)}%`}
                  （{CAPTURE_LABELS[c.status]}）
                </div>
              </div>
            )
          })
        )}
      </fieldset>
    </div>
  )
}
