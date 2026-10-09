import { Navigate, type RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { AssumptionsPage } from './pages/AssumptionsPage'
import { MapPage } from './pages/MapPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ResultsPage } from './pages/ResultsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <MapPage /> },
      { path: 'results', element: <ResultsPage /> },
      { path: 'assumptions', element: <AssumptionsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
