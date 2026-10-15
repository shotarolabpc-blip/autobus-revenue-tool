import { useState, type RefObject } from 'react'
import { resolveDerived, type ScenarioResult } from '../../calc/pipeline'
import { downloadBlob } from '../../export/download'
import { downloadSvgAsPng } from '../../export/png'
import {
  assumptionsSheet,
  buildSheets,
  fareTableSheet,
  safeName,
  sheetToCsv,
  stopSheet,
  yearSheet,
  type ExportContext,
  type Sheet,
} from '../../export/results'
import { sheetsToXlsx } from '../../export/xlsx'
import type { ProjectFile } from '../../project/schema'
import type { ResultsState } from '../../project/useResults'

type Props = {
  project: ProjectFile
  state: Extract<ResultsState, { status: 'ready' }>
  detail: ScenarioResult
  ridersChart: RefObject<SVGSVGElement | null>
  revenueChart: RefObject<SVGSVGElement | null>
}

/** 結果の出力（CSV・Excel・グラフのPNG）。すべてブラウザの中で作り、外部へは送らない（F-8-8） */
export function ExportBar({ project, state, detail, ridersChart, revenueChart }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const scenario = project.scenarios.find((s) => s.id === detail.scenarioId)

  const context = (): ExportContext | null => {
    if (!scenario) return null
    return {
      project,
      scenario: resolveDerived(project, scenario),
      result: detail,
      coefficientsFile: state.static.coefficients,
      fareRefs: state.static.fareRefs,
      attributions: state.static.attributions,
      populationVersion: state.populationVersion,
      taxRate: state.static.defaults.items.consumptionTaxRate.value,
      toolVersion: __APP_VERSION__,
      now: new Date(),
    }
  }
  const base = `${safeName(project.project.name)}_${safeName(detail.scenarioName)}`
  const run = async (fn: (ctx: ExportContext) => Promise<void> | void) => {
    const ctx = context()
    if (!ctx) return
    try {
      setMessage(null)
      await fn(ctx)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }
  const csv = (name: string, make: (c: ExportContext) => Sheet) => () =>
    run((ctx) =>
      downloadBlob(
        `${base}_${name}.csv`,
        new Blob([sheetToCsv(make(ctx))], { type: 'text/csv;charset=utf-8' }),
      ),
    )
  const png = (chart: RefObject<SVGSVGElement | null>, name: string) => () =>
    run(async () => {
      if (chart.current) await downloadSvgAsPng(chart.current, `${base}_${name}.png`)
    })

  return (
    <div role="group" aria-label="結果の出力">
      <h4>ダウンロード</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            run(async (ctx) => downloadBlob(`${base}.xlsx`, await sheetsToXlsx(buildSheets(ctx))))
          }
        >
          Excel（.xlsx）
        </button>
        <button type="button" className="btn" onClick={csv('年度別推計', yearSheet)}>
          CSV：年度別
        </button>
        <button type="button" className="btn" onClick={csv('バス停別', stopSheet)}>
          CSV：バス停別
        </button>
        <button type="button" className="btn" onClick={csv('運賃表', fareTableSheet)}>
          CSV：運賃表
        </button>
        <button type="button" className="btn" onClick={csv('前提条件', assumptionsSheet)}>
          CSV：前提条件
        </button>
        <button type="button" className="btn" onClick={png(ridersChart, '延べ乗車人員')}>
          グラフ（延べ乗車人員）をPNGで保存
        </button>
        <button type="button" className="btn" onClick={png(revenueChart, '運賃収入')}>
          グラフ（運賃収入）をPNGで保存
        </button>
      </div>
      <p className="hint">
        どの出力にも、推計日時・シナリオ名・データ版数・出典・ツール版数を入れています。ファイルはこのブラウザの中で作り、外部へは送りません。
      </p>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
