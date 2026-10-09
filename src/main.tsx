import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import { routes } from './routes'
import './index.css'

// GitHub Pages はサーバ側でURLの書き換えができないため、ハッシュ方式（#/map など）にする。
const router = createHashRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
