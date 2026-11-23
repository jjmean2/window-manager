import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { ManagerContext, useManagerStore } from './context.ts'
import { wasHandledByWindow } from './events.ts'
import { createWindowManagerStore, type WindowLayout } from './store.ts'

export interface WindowManagerRootProps {
  /** 처음에 적용할 배치. 저장해 둔 값을 넣으면 창의 자리와 순서가 복원된다 */
  defaultLayout?: WindowLayout
  /** 배치가 바뀌면 호출된다. 이동·리사이즈 도중이 아니라 끝났을 때 한 번 호출된다 */
  onLayoutChange?: (layout: WindowLayout) => void
  /** 창이 영역 밖으로 나가도 남겨 둘 타이틀바의 가로 폭. 기본 64 */
  minVisibleWidth?: number
  children?: ReactNode
}

/** 창 목록, 겹침 순서, 활성 창을 갖는다. DOM 은 그리지 않는다. */
export function WindowManagerRoot(props: WindowManagerRootProps) {
  const { defaultLayout, onLayoutChange, minVisibleWidth, children } = props
  const [store] = useState(() => createWindowManagerStore(defaultLayout, { minVisibleWidth }))

  const onLayoutChangeRef = useRef(onLayoutChange)
  useEffect(() => {
    onLayoutChangeRef.current = onLayoutChange
  })
  useEffect(() => {
    store.setLayoutListener((layout) => onLayoutChangeRef.current?.(layout))
    return () => store.setLayoutListener(null)
  }, [store])

  return <ManagerContext.Provider value={store}>{children}</ManagerContext.Provider>
}

/**
 * 뷰포트 전체를 기준 영역으로 삼는 창 레이어.
 *
 * 앱 루트(`isolation: isolate`) 안에, 앱 내용 뒤에 둔다. 그러면 body 로 portal 되는
 * 다이얼로그·팝오버·툴팁이 z-index 계산 없이 모든 창 위에 온다.
 * 창끼리의 순서는 이 레이어 안에서만 정해진다.
 */
export function WindowManagerViewport(props: ComponentProps<'div'>) {
  const { style, ...rest } = props
  const store = useManagerStore()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    store.setLayerEl(el)
    const measure = () => store.setAreaSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)

    // 어느 창에도 속하지 않은 곳을 누르면 활성 창을 푼다.
    // React 핸들러(루트 컨테이너)가 document 의 버블 리스너보다 먼저 실행된다.
    const onPointerDown = (event: PointerEvent) => {
      if (!wasHandledByWindow(event)) store.deactivate()
    }
    document.addEventListener('pointerdown', onPointerDown)

    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', onPointerDown)
      store.setLayerEl(null)
    }
  }, [store])

  return (
    <div
      data-window-layer=""
      {...rest}
      ref={ref}
      style={{
        ...style,
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        isolation: 'isolate',
      }}
    />
  )
}

export interface WindowManagerApi {
  getLayout: () => WindowLayout
  setLayout: (layout: WindowLayout) => void
  activate: (id: string) => void
}

/** 배치를 읽고 쓰는 명령형 API. 값이 바뀌어도 다시 렌더링되지 않는다. */
export function useWindowManager(): WindowManagerApi {
  const store = useManagerStore()
  return useMemo(
    () => ({ getLayout: store.getLayout, setLayout: store.setLayout, activate: store.activate }),
    [store],
  )
}
