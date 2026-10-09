import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ProjectSettingsForm } from '../components/ProjectSettingsForm'
import { ScenarioList } from '../components/ScenarioList'
import { useNotice } from '../components/notice'
import { loadDefaults, loadPrefectures } from '../data/staticData'
import { useAsync } from '../data/useAsync'
import { saveProjectToFile, toProjectDefaults } from '../project/actions'
import { nextFiscalYear, type NewProjectInput } from '../project/factory'
import { PROJECT_FILE_EXTENSION } from '../project/io'
import { confirmDiscardChanges, openFileWithNotice } from '../project/openWithNotice'
import { clearBrowserData } from '../project/storage'
import { useProjectStore } from '../project/store'

const loadAll = () => Promise.all([loadDefaults(), loadPrefectures()])

export function ProjectPage() {
  const state = useAsync(loadAll)
  const project = useProjectStore((s) => s.project)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  if (state.status === 'loading') return <p className="page-message">読み込み中…</p>
  if (state.status === 'error') {
    return <p className="page-message error">設定を読み込めません：{state.error.message}</p>
  }
  const [defaults, prefectures] = state.data
  const projectDefaults = toProjectDefaults(defaults)

  const newInput: NewProjectInput = {
    name: '',
    prefCode: prefectures.defaultCode,
    cityCode: null,
    municipalityName: '',
    startFiscalYear: nextFiscalYear(new Date()),
    years: defaults.items.projectYears.value,
  }

  const openPicker = () => {
    if (confirmDiscardChanges()) fileInput.current?.click()
  }

  const fileSection = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={`${PROJECT_FILE_EXTENSION},.json,application/json`}
        hidden
        data-testid="project-file-input"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          // 確認は openPicker で済んでいるので、ここでは未保存扱いを外してから開く
          useProjectStore.setState({ dirty: false })
          await openFileWithNotice(file)
        }}
      />
    </>
  )

  if (!project || creating) {
    return (
      <section className="page page-narrow" aria-label="プロジェクト">
        <h2>プロジェクト</h2>
        {fileSection}
        <div className="card">
          <h3>新しく作る</h3>
          <ProjectSettingsForm
            prefectures={prefectures.items}
            defaults={defaults}
            initial={newInput}
            submitLabel="作成する"
            onCancel={creating ? () => setCreating(false) : undefined}
            onSubmit={(v) => {
              useProjectStore.getState().newProject(v, projectDefaults)
              setCreating(false)
              navigate('/map')
            }}
          />
        </div>
        <div className="card">
          <h3>保存したファイルを開く</h3>
          <p>
            プロジェクトファイル（{PROJECT_FILE_EXTENSION}
            ）を選ぶか、この画面にドラッグ＆ドロップしてください。
          </p>
          <button type="button" className="btn" onClick={openPicker}>
            ファイルを選んで開く
          </button>
        </div>
        <ClearDataCard />
      </section>
    )
  }

  const p = project.project
  return (
    <section className="page page-narrow" aria-label="プロジェクト">
      <h2>プロジェクト</h2>
      {fileSection}
      <div className="card">
        <h3>基本情報</h3>
        <ProjectSettingsForm
          key={project.savedAt + p.name}
          prefectures={prefectures.items}
          defaults={defaults}
          initial={{
            name: p.name,
            prefCode: p.municipality.prefCode,
            cityCode: p.municipality.cityCode,
            municipalityName: p.municipality.name,
            startFiscalYear: p.startFiscalYear,
            years: p.years,
          }}
          submitLabel="基本情報を更新"
          onSubmit={(v) =>
            useProjectStore.getState().updateProject((x) => ({
              ...x,
              project: {
                name: v.name,
                municipality: {
                  prefCode: v.prefCode,
                  cityCode: v.cityCode,
                  name: v.municipalityName,
                },
                startFiscalYear: v.startFiscalYear,
                years: v.years,
              },
            }))
          }
        />
      </div>
      <div className="card">
        <h3>シナリオ</h3>
        <ScenarioList defaults={projectDefaults} />
      </div>
      <div className="card">
        <h3>ファイル</h3>
        <p>
          入力内容は、プロジェクトファイルとしてダウンロードして保存します（サーバには保存されません）。
          メールやTeamsで渡せば、相手のブラウザで同じ内容を開けます。
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={saveProjectToFile}>
            保存（ダウンロード）
          </button>
          <button type="button" className="btn" onClick={openPicker}>
            別のファイルを開く
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (confirmDiscardChanges()) setCreating(true)
            }}
          >
            新しく作る
          </button>
        </div>
        <p className="hint">最終保存：{new Date(project.savedAt).toLocaleString('ja-JP')}</p>
      </div>
      <ClearDataCard />
    </section>
  )
}

/** 「ブラウザ内のデータを消去」（共用PC対策。F-1-9） */
function ClearDataCard() {
  return (
    <div className="card">
      <h3>ブラウザ内のデータ</h3>
      <p>
        作業内容は、このブラウザの中に自動で一時保存されます。共用のPCでは、作業が終わったら消去してください。
      </p>
      <button
        type="button"
        className="btn btn-danger"
        onClick={async () => {
          const dirty = useProjectStore.getState().dirty
          const msg = dirty
            ? '保存（ダウンロード）していない変更も消えます。ブラウザ内のデータを消去しますか？'
            : 'このブラウザ内の一時保存データを消去しますか？'
          if (!confirm(msg)) return
          useProjectStore.getState().closeProject()
          await clearBrowserData()
          useNotice.getState().show({
            kind: 'info',
            title: '消去しました',
            messages: ['このブラウザ内の一時保存データを消去しました。'],
          })
        }}
      >
        ブラウザ内のデータを消去
      </button>
    </div>
  )
}
