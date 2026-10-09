import { Navigate, type RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { AssumptionsPage } from './pages/AssumptionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlanPage } from './pages/PlanPage'
import { ProjectPage } from './pages/ProjectPage'
import { ResultsPage } from './pages/ResultsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/project" replace /> },
      { path: 'project', element: <ProjectPage /> },
      {
        path: 'map',
        // 地図（MapLibre）は大きいので、地図画面を開いたときに読み込む
        lazy: async () => ({ Component: (await import('./pages/MapPage')).MapPage }),
      },
      {
        // 経路計算の確認用（ナビゲーションには出さない）
        path: 'route-test',
        lazy: async () => ({ Component: (await import('./pages/RouteTestPage')).RouteTestPage }),
      },
      { path: 'plan', element: <PlanPage /> },
      { path: 'results', element: <ResultsPage /> },
      { path: 'assumptions', element: <AssumptionsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
