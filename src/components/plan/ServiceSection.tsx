import { operatingDays, type HolidayData } from '../../calc/calendar'
import {
  dailyCapacity,
  effectiveCapacity,
  maxTripsPerVehicle,
  parseHm,
  tripMinutes,
} from '../../calc/service'
import type { DefaultsFile, HolidaysFile, VehiclePresetsFile } from '../../data/schemas'
import { routeKm } from '../../gis/route'
import { emptyVehicle } from '../../project/factory'
import type { ProjectFile, Scenario, Service, Vehicle } from '../../project/schema'
import { useProjectStore } from '../../project/store'
import { fmt } from '../../util/format'
import { NumField, Stat, TriField } from '../fields'

type Props = {
  project: ProjectFile
  scenario: Scenario
  presets: VehiclePresetsFile
  holidays: HolidaysFile
  holidayData: HolidayData
  defaults: DefaultsFile
}

const VEHICLE_FIELDS: { key: keyof Vehicle; label: string; unit?: string }[] = [
  { key: 'capacity', label: '定員（公道・自動運転時の運用定員）', unit: '人' },
  { key: 'seats', label: '座席数', unit: '席' },
  { key: 'operatorCount', label: '保安要員の人数', unit: '人' },
  { key: 'maxSpeedKmh', label: '最高速度', unit: 'km/h' },
  { key: 'avgSpeedKmh', label: '運行平均速度', unit: 'km/h' },
  { key: 'rangeKm', label: '航続距離', unit: 'km' },
  { key: 'chargeHours', label: '充電時間', unit: '時間' },
]

/** 運行計画と車両の前提条件（F-3、F-3A） */
export function ServiceSection({
  project,
  scenario,
  presets,
  holidays,
  holidayData,
  defaults,
}: Props) {
  const sv = scenario.service
  const v = sv.vehicle
  const st = useProjectStore.getState
  const setService = (patch: Partial<Service>) =>
    st().updateScenario(scenario.id, (s) => ({ ...s, service: { ...s.service, ...patch } }))
  const setVehicle = (patch: Partial<Vehicle>) => {
    // 値を手で変えたら、その値の出典は「ユーザー入力」にする
    const sources = { ...v.sources }
    for (const k of Object.keys(patch)) sources[k] = 'ユーザー入力'
    setService({ vehicle: { ...v, ...patch, sources } })
  }

  const allPresets: Vehicle[] = [...presets.items, ...project.userVehiclePresets, emptyVehicle()]
  const lengthKm = routeKm(scenario.route, scenario.stops)
  const effCap = effectiveCapacity(v)
  const minutes = tripMinutes(lengthKm, v.avgSpeedKmh, sv.tripMinutesOverride)
  const start = parseHm(sv.serviceStart)
  const end = parseHm(sv.serviceEnd)
  const serviceMinutes = start !== null && end !== null && end > start ? end - start : null
  const maxPerVehicle =
    minutes !== null && serviceMinutes !== null
      ? maxTripsPerVehicle({
          serviceMinutes,
          tripMinutes: minutes,
          tripKm: lengthKm,
          rangeKm: v.rangeKm,
          chargeHours: v.chargeHours,
        })
      : null
  const maxTotal = maxPerVehicle !== null ? maxPerVehicle * sv.vehicles : null
  const overTrips = maxTotal !== null && Math.max(sv.weekdayTrips, sv.holidayTrips) > maxTotal

  const years = Array.from(
    { length: project.project.years },
    (_, i) => project.project.startFiscalYear + i,
  )
  const days = years.map((y) => ({ y, ...operatingDays(y, holidayData, sv.yearEndSuspended) }))
  const firstDays = days[0]

  return (
    <>
      <div className="card">
        <h3>車両（F-3A）</h3>
        <div className="field-row">
          <label className="field field-compact">
            <span>車両プリセット</span>
            <select
              value={v.presetId}
              onChange={(e) => {
                const p = allPresets.find((x) => x.presetId === e.target.value)
                if (!p) return
                if (
                  v.presetId !== 'custom' &&
                  !confirm('車両の値をプリセットの値で置き換えます。よろしいですか？')
                ) {
                  return
                }
                setService({ vehicle: structuredClone(p) })
              }}
            >
              {allPresets.map((p) => (
                <option key={p.presetId} value={p.presetId}>
                  {p.name}
                  {project.userVehiclePresets.some((u) => u.presetId === p.presetId)
                    ? '（ユーザー定義）'
                    : ''}
                </option>
              ))}
              {!allPresets.some((p) => p.presetId === v.presetId) && (
                <option value={v.presetId}>{v.name}</option>
              )}
            </select>
            <small className="hint">
              プリセットは参考値です（{presets.checkedAt}{' '}
              時点）。実際の値はメーカー・運行事業者に確認してください。
            </small>
          </label>
          <label className="field field-compact">
            <span>車両名</span>
            <input value={v.name} onChange={(e) => setVehicle({ name: e.target.value })} />
          </label>
        </div>
        <div className="field-grid">
          {VEHICLE_FIELDS.map((f) =>
            f.key === 'operatorCount' && v.operatorOnBoard === false ? null : (
              <NumField
                key={f.key}
                label={f.label}
                unit={f.unit}
                value={v[f.key] as number | null}
                required={['capacity', 'operatorCount', 'avgSpeedKmh'].includes(f.key)}
                onChange={(x) => setVehicle({ [f.key]: x })}
                hint={v.sources[f.key] ? `出典：${v.sources[f.key]}` : undefined}
              />
            ),
          )}
          <TriField
            label="立席の使用"
            value={v.standingAllowed}
            onChange={(x) => setVehicle({ standingAllowed: x })}
            yes="使う"
            no="使わない（座席のみ）"
            hint={v.sources.standingAllowed ? `出典：${v.sources.standingAllowed}` : undefined}
          />
          <TriField
            label="保安要員の乗車"
            value={v.operatorOnBoard}
            onChange={(x) => setVehicle({ operatorOnBoard: x })}
            yes="乗車する"
            no="乗車しない"
            hint={v.sources.operatorOnBoard ? `出典：${v.sources.operatorOnBoard}` : undefined}
          />
          <TriField
            label="車椅子対応"
            value={v.wheelchair}
            onChange={(x) => setVehicle({ wheelchair: x })}
          />
          <label className="field field-compact">
            <span>自動運転レベル</span>
            <select
              value={v.autonomyLevel ?? ''}
              onChange={(e) =>
                setVehicle({ autonomyLevel: (e.target.value || null) as Vehicle['autonomyLevel'] })
              }
            >
              <option value="">（未入力）</option>
              <option value="L2">レベル2</option>
              <option value="L4">レベル4</option>
            </select>
          </label>
        </div>
        <div className="stats">
          <Stat
            label="実効定員"
            value={effCap === null ? '要入力' : `${fmt(effCap)} 人`}
            note="運用定員 − 乗車する保安要員（立席を使わない場合は座席数をもとに計算）"
          />
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              const name = prompt('ユーザー定義プリセットの名前', v.name)
              if (!name) return
              const preset: Vehicle = {
                ...structuredClone(v),
                presetId: `user-${crypto.randomUUID()}`,
                name,
              }
              st().updateProject((p) => ({
                ...p,
                userVehiclePresets: [...p.userVehiclePresets, preset],
              }))
              setService({ vehicle: preset })
            }}
          >
            この車両をプリセットとして保存
          </button>
          {project.userVehiclePresets.some((u) => u.presetId === v.presetId) && (
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() =>
                st().updateProject((p) => ({
                  ...p,
                  userVehiclePresets: p.userVehiclePresets.filter((u) => u.presetId !== v.presetId),
                }))
              }
            >
              このユーザー定義プリセットを削除
            </button>
          )}
        </div>
        <p className="hint">
          ユーザー定義プリセットはプロジェクトファイルに保存されます（F-3A-7）。
        </p>
      </div>

      <div className="card">
        <h3>運行計画（F-3）</h3>
        <div className="field-grid">
          <NumField
            label="1日あたり運行便数（平日）"
            unit="便"
            step={1}
            value={sv.weekdayTrips}
            onChange={(x) => setService({ weekdayTrips: x ?? 0 })}
          />
          <NumField
            label="1日あたり運行便数（土休日）"
            unit="便"
            step={1}
            value={sv.holidayTrips}
            onChange={(x) => setService({ holidayTrips: x ?? 0 })}
          />
          <label className={`field field-compact${sv.serviceStart === null ? ' is-missing' : ''}`}>
            <span>
              運行開始時刻{sv.serviceStart === null && <em className="required">要入力</em>}
            </span>
            <input
              type="time"
              value={sv.serviceStart ?? ''}
              onChange={(e) => setService({ serviceStart: e.target.value || null })}
            />
          </label>
          <label className={`field field-compact${sv.serviceEnd === null ? ' is-missing' : ''}`}>
            <span>
              運行終了時刻{sv.serviceEnd === null && <em className="required">要入力</em>}
            </span>
            <input
              type="time"
              value={sv.serviceEnd ?? ''}
              onChange={(e) => setService({ serviceEnd: e.target.value || null })}
            />
          </label>
          <NumField
            label="車両台数（運行に使う台数）"
            unit="台"
            step={1}
            value={sv.vehicles}
            onChange={(x) => setService({ vehicles: Math.round(x ?? 0) })}
          />
          <NumField
            label="予備車の台数"
            unit="台"
            step={1}
            value={sv.spareVehicles}
            onChange={(x) => setService({ spareVehicles: Math.round(x ?? 0) })}
          />
          <NumField
            label="想定最大乗車率"
            unit="%"
            min={0}
            max={100}
            value={Math.round(sv.maxLoadFactor * 1000) / 10}
            onChange={(x) => setService({ maxLoadFactor: (x ?? 0) / 100 })}
            hint={`初期値 ${defaults.items.maxLoadFactor.value * 100}%：${defaults.items.maxLoadFactor.source}`}
          />
          <NumField
            label="所要時間（手修正）"
            unit="分"
            value={sv.tripMinutesOverride}
            placeholder="自動"
            onChange={(x) => setService({ tripMinutesOverride: x })}
            hint="空欄なら ルート延長 ÷ 運行平均速度"
          />
        </div>
        <div className="stats">
          <Stat
            label={scenario.route.loop ? 'ルート延長（1周）' : 'ルート延長（片道）'}
            value={`${fmt(lengthKm, 2)} km`}
          />
          <Stat
            label={scenario.route.loop ? '所要時間（1周）' : '所要時間（片道）'}
            value={minutes === null ? '要入力' : `${fmt(minutes, 1)} 分`}
            note={sv.tripMinutesOverride !== null ? '手修正' : '延長 ÷ 平均速度'}
          />
          <Stat
            label="1日の輸送力（平日）"
            value={
              effCap === null
                ? '要入力'
                : `${fmt(dailyCapacity(effCap, sv.weekdayTrips, sv.maxLoadFactor))} 人`
            }
            note="実効定員 × 便数 × 最大乗車率"
          />
          <Stat
            label="1日の輸送力（土休日）"
            value={
              effCap === null
                ? '要入力'
                : `${fmt(dailyCapacity(effCap, sv.holidayTrips, sv.maxLoadFactor))} 人`
            }
          />
          <Stat
            label="1台の1日最大便数（目安）"
            value={maxPerVehicle === null ? '要入力' : `${fmt(maxPerVehicle)} 便`}
            note={
              v.rangeKm === null || v.chargeHours === null
                ? '航続距離・充電時間が未入力のため、運行時間帯だけで計算'
                : '運行時間帯の中で、電池が足りなくなったら充電すると仮定'
            }
          />
        </div>
        {overTrips && (
          <p className="text-warning">
            入力した便数（平日 {sv.weekdayTrips}・土休日 {sv.holidayTrips}）が、車両 {sv.vehicles}{' '}
            台で運行できる目安（{fmt(maxTotal)}{' '}
            便／日）を超えています。車両台数・運行時間帯・便数を見直してください。
          </p>
        )}
      </div>

      <div className="card">
        <h3>年間運行日数（F-3-1）</h3>
        <label className="field-inline">
          <input
            type="checkbox"
            checked={sv.yearEndSuspended}
            onChange={(e) => setService({ yearEndSuspended: e.target.checked })}
          />
          年末年始（12月29日〜1月3日）は運休する
        </label>
        <p className="hint">
          祝日：{holidays.source}（公表値は {holidays.publishedThrough} まで。
          {holidays.estimatedNote}）。年末年始の範囲：
          {holidays.yearEnd.source}
        </p>
        <table className="table table-compact">
          <thead>
            <tr>
              <th>年度</th>
              <th className="num">平日</th>
              <th className="num">土休日</th>
              <th className="num">運休</th>
              <th>祝日</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.y}>
                <td>{d.y}年度</td>
                <td className="num">{d.weekday}</td>
                <td className="num">{d.holiday}</td>
                <td className="num">{d.suspended}</td>
                <td>{d.usesEstimatedHolidays ? '推定値を含む' : '公表値'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="field-row">
          <NumField
            label="平日の運行日数（手修正・全年度）"
            unit="日"
            value={sv.weekdayDaysOverride}
            placeholder={String(firstDays?.weekday ?? '')}
            onChange={(x) => setService({ weekdayDaysOverride: x })}
            hint="空欄ならカレンダーから自動計算"
          />
          <NumField
            label="土休日の運行日数（手修正・全年度）"
            unit="日"
            value={sv.holidayDaysOverride}
            placeholder={String(firstDays?.holiday ?? '')}
            onChange={(x) => setService({ holidayDaysOverride: x })}
          />
        </div>
      </div>
    </>
  )
}
