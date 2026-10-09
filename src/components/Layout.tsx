import { NavLink, Outlet } from 'react-router'
import { navItems } from '../navItems'
import { useAutosave } from '../project/useAutosave'
import { FileDropZone } from './FileDropZone'
import { NoticeDialog } from './NoticeDialog'
import { ProjectBar } from './ProjectBar'
import { RestoreDraftDialog } from './RestoreDraftDialog'

export function Layout() {
  useAutosave()
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">自動運転バス 収入予測ツール</h1>
        <nav className="app-nav" aria-label="画面の切り替え">
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} className="app-nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <ProjectBar />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>ツール版数 v{__APP_VERSION__}</span>
        <span>入力したデータはこのブラウザの中だけで扱い、外部へは送信しません。</span>
      </footer>
      <FileDropZone />
      <RestoreDraftDialog />
      <NoticeDialog />
    </div>
  )
}
