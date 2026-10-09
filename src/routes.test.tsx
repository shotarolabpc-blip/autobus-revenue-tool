// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { navItems } from './navItems'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

afterEach(cleanup)

describe('画面の切り替え', () => {
  it('最初は地図の画面を表示する', () => {
    const router = renderAt('/')
    expect(router.state.location.pathname).toBe('/map')
    expect(screen.getByRole('heading', { level: 2, name: '地図' })).toBeTruthy()
  })

  it.each([
    ['/map', '地図'],
    ['/results', '推計結果'],
    ['/assumptions', '前提条件'],
  ])('%s で「%s」の画面を表示する', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy()
  })

  it('ナビゲーションに3つの画面が順に並び、押すと画面が切り替わる', async () => {
    const router = renderAt('/map')
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
