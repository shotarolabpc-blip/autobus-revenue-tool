import { create } from 'zustand'
import {
  createProject,
  createScenario,
  duplicateScenario,
  type NewProjectInput,
  type ProjectDefaults,
} from './factory'
import type { ProjectFile, Scenario } from './schema'

export type ProjectState = {
  project: ProjectFile | null
  activeScenarioId: string | null
  /** プロジェクトファイルとしてダウンロードしていない変更があるか（F-1-8） */
  dirty: boolean
  newProject: (input: NewProjectInput, defaults: ProjectDefaults) => void
  /** 読み込んだファイル・一時保存から開く */
  openProject: (project: ProjectFile, dirty?: boolean) => void
  closeProject: () => void
  markSaved: (savedAt: string) => void
  updateProject: (fn: (p: ProjectFile) => ProjectFile) => void
  updateScenario: (id: string, fn: (s: Scenario) => Scenario) => void
  setActiveScenario: (id: string) => void
  addScenario: (name: string, defaults: ProjectDefaults) => void
  duplicateScenario: (id: string) => void
  renameScenario: (id: string, name: string) => void
  /** 最後の1つは削除できない */
  deleteScenario: (id: string) => void
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  activeScenarioId: null,
  dirty: false,

  newProject: (input, defaults) => {
    const project = createProject(input, defaults)
    set({ project, activeScenarioId: project.scenarios[0].id, dirty: true })
  },

  openProject: (project, dirty = false) =>
    set({ project, activeScenarioId: project.scenarios[0].id, dirty }),

  closeProject: () => set({ project: null, activeScenarioId: null, dirty: false }),

  markSaved: (savedAt) => {
    const p = get().project
    if (p) set({ project: { ...p, savedAt }, dirty: false })
  },

  updateProject: (fn) => {
    const p = get().project
    if (p) set({ project: fn(p), dirty: true })
  },

  updateScenario: (id, fn) =>
    get().updateProject((p) => ({
      ...p,
      scenarios: p.scenarios.map((s) => (s.id === id ? fn(s) : s)),
    })),

  setActiveScenario: (id) => {
    if (get().project?.scenarios.some((s) => s.id === id)) set({ activeScenarioId: id })
  },

  addScenario: (name, defaults) => {
    const s = { ...createScenario(name, defaults), type: 'custom' as const }
    get().updateProject((p) => ({ ...p, scenarios: [...p.scenarios, s] }))
    set({ activeScenarioId: s.id })
  },

  duplicateScenario: (id) => {
    const src = get().project?.scenarios.find((s) => s.id === id)
    if (!src) return
    const copy = duplicateScenario(src)
    get().updateProject((p) => {
      const i = p.scenarios.findIndex((s) => s.id === id)
      const scenarios = [...p.scenarios]
      scenarios.splice(i + 1, 0, copy)
      return { ...p, scenarios }
    })
    set({ activeScenarioId: copy.id })
  },

  renameScenario: (id, name) => {
    if (!name.trim()) return
    get().updateScenario(id, (s) => ({ ...s, name: name.trim() }))
  },

  deleteScenario: (id) => {
    const p = get().project
    if (!p || p.scenarios.length <= 1) return
    const scenarios = p.scenarios.filter((s) => s.id !== id)
    set({
      project: { ...p, scenarios },
      dirty: true,
      activeScenarioId: get().activeScenarioId === id ? scenarios[0].id : get().activeScenarioId,
    })
  },
}))

/** 表示中のシナリオ */
export function useActiveScenario(): Scenario | null {
  return useProjectStore(
    (s) => s.project?.scenarios.find((x) => x.id === s.activeScenarioId) ?? null,
  )
}
