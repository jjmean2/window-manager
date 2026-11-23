import { createContext, useContext, useSyncExternalStore } from 'react'
import type { WindowManagerState, WindowManagerStore } from './store.ts'

export const ManagerContext = createContext<WindowManagerStore | null>(null)

export function useManagerStore(): WindowManagerStore {
  const store = useContext(ManagerContext)
  if (!store) throw new Error('WindowManager 파트는 <WindowManager.Root> 안에서 써야 합니다.')
  return store
}

/**
 * 저장소에서 값 하나를 골라 구독한다. selector 는 원시값이나 저장소가 그대로 들고 있는
 * 참조를 돌려줘야 한다. 그래야 다른 창의 변화로 다시 렌더링되지 않는다.
 */
export function useManagerState<T>(
  store: WindowManagerStore,
  selector: (state: WindowManagerState) => T,
): T {
  const getSnapshot = () => selector(store.getState())
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

export interface WindowContextValue {
  id: string
  titleId: string
  store: WindowManagerStore
  setOpen: (open: boolean) => void
}

export const WindowContext = createContext<WindowContextValue | null>(null)

export function useWindowContext(): WindowContextValue {
  const context = useContext(WindowContext)
  if (!context) throw new Error('Window 파트는 <Window.Root> 안에서 써야 합니다.')
  return context
}
