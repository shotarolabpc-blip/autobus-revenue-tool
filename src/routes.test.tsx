// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navItems } from './navItems'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

// public/data/ の静的データを、ブラウザの代わりにディスクから返す
beforeEach(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const path = join(process.cwd(), 'public', String(url))
    try {
      return new Response(await readFile(path))
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('画面の切り替え', () => {
  it('最初はプロジェクトの画面を表示する', async () => {
    const router = renderAt('/')
    expect(await screen.findByRole('region', { name: 'プロジェクト' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/project')
    expect(await screen.findByRole('heading', { name: '新しく作る' })).toBeTruthy()
  })

  it('/map で地図の画面を表示する', async () => {
    renderAt('/map')
    expect(await screen.findByRole('region', { name: '地図' })).toBeTruthy()
  })

  it.each([
    ['/results', '推計結果'],
    ['/assumptions', '前提条件'],
  ])('%s で「%s」の画面を表示する', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy()
  })

  it('ナビゲーションに5つの画面が順に並び、押すと画面が切り替わる', async () => {
    const router = renderAt('/map')
    await screen.findByRole('region', { name: '地図' })
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(navItems.map((n) => n.label))

    await act(() => router.navigate('/results'))
    expect(screen.getByRole('heading', { level: 2, name: '推計結果' })).toBeTruthy()
    const active = screen.getByRole('link', { name: '推計結果' })
    expect(active.getAttribute('aria-current')).toBe('page')
  })

  it('存在しないURLでは案内を表示し、画面は壊れない', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '地図の画面へ戻る' })).toBeTruthy()
  })
})
