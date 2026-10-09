import { useEffect, useState } from 'react'

export type AsyncState<T> =
  { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: T }

/** 非同期の読み込み（静的データなど）を状態として扱う */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (e: unknown) =>
        alive &&
        setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) }),
    )
    return () => {
      alive = false
    }
    // load は呼び出し側で固定の関数を渡す前提
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return state
}
