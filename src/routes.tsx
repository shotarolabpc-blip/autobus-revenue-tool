import { Navigate, type RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { AssumptionsPage } from './pages/AssumptionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ResultsPage } from './pages/ResultsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      {
        path: 'map',
        // 地図（MapLibre）は大きいので、地図画面を開いたときに読み込む
        lazy: async () => ({ Component: (await import('./pages/MapPage')).MapPage }),
      },
      { path: 'results', element: <ResultsPage /> },
      { path: 'assumptions', element: <AssumptionsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
