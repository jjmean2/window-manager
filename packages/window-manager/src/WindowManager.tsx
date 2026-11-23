import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ManagerContext, useManagerState, useManagerStore } from './context.ts'
import { wasHandledByWindow } from './events.ts'
import { snapTargetRect, type SnapOptions, type SnapZone } from './placement.ts'
import { createWindowManagerStore, type WindowLayout, type WindowListItem } from './store.ts'

export interface WindowManagerRootProps {
  /** 처음에 적용할 배치. 저장해 둔 값을 넣으면 창의 자리·순서·배치가 복원된다 */
  defaultLayout?: WindowLayout
  /** 배치가 바뀌면 호출된다. 이동·리사이즈 도중이 아니라 끝났을 때 한 번 호출된다 */
  onLayoutChange?: (layout: WindowLayout) => void
  /** 창이 영역 밖으로 나가도 남겨 둘 타이틀바의 가로 폭. 기본 64 */
  minVisibleWidth?: number
  /**
   * 창이 기준 영역을 얼마나 벗어날 수 있는지.
   * - `'reachable'` (기본): 벗어날 수 있지만 타이틀바의 잡을 수 있는 부분은 남는다.
   * - `'contain'`: 창 전체가 영역 안에 머문다. 영역보다 큰 창은 왼쪽 위에 맞춘다.
   */
  moveConstraint?: 'reachable' | 'contain'
  /**
   * 끌다가 포인터가 가장자리에 닿으면 스냅한다. 왼쪽·오른쪽은 절반, 위쪽은 최대화다.
   * 기본은 꺼져 있다. 켜면 포인터가 좌우 가장자리에 닿은 채로는 창을 그쪽 화면 밖에
   * 걸쳐 둘 수 없다. `{ top: false }` 로 위쪽 최대화만 끌 수 있다.
   */
  snap?: boolean | Partial<SnapOptions>
  children?: ReactNode
}

/** 창 목록, 겹침 순서, 활성 창을 갖는다. DOM 은 그리지 않는다. */
export function WindowManagerRoot(props: WindowManagerRootProps) {
  const { defaultLayout, onLayoutChange, minVisibleWidth, moveConstraint, snap, children } = props
  const [store] = useState(() =>
    createWindowManagerStore(defaultLayout, { minVisibleWidth, moveConstraint, snap }),
  )

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
 * 창이 그려지는 레이어. 이 상자가 기준 영역이다. 좌표의 원점이고, 이동 제약과
 * 최대화·스냅이 이 상자를 기준으로 계산된다. Viewport 와 Area 는 놓이는 방식과
 * 잘라내기만 다르다.
 */
function WindowLayer(props: ComponentProps<'div'> & { kind: 'viewport' | 'area' }) {
  const { kind, style, ...rest } = props
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
      if (!wasHandledByWindow(event, store)) store.deactivate()
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
      data-window-layer={kind}
      {...rest}
      ref={ref}
      style={{
        // inset 축약형을 쓰지 않는다. 사용처가 bottom 같은 값을 넣었다 빼면 React 가 그 속성만
        // 지워서, 축약형에서 온 0 까지 사라지고 레이어 높이가 무너진다.
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        // hidden 이 아니라 clip 이다. hidden 이면 영역 밖에 걸친 창 안의 요소가 포커스를 받을 때
        // 레이어가 스크롤되어 모든 창이 밀린다.
        ...(kind === 'area' ? { overflow: 'clip' } : null),
        ...style,
        position: kind === 'viewport' ? 'fixed' : 'absolute',
        pointerEvents: 'none',
        isolation: 'isolate',
      }}
    />
  )
}

/**
 * 뷰포트 전체를 기준 영역으로 삼는 창 레이어.
 *
 * 앱 루트(`isolation: isolate`) 안에, 앱 내용 뒤에 둔다. 그러면 body 로 portal 되는
 * 다이얼로그·팝오버·툴팁이 z-index 계산 없이 모든 창 위에 온다.
 * 창끼리의 순서는 이 레이어 안에서만 정해진다.
 *
 * 독이나 상단 바의 자리를 비우려면 `style` 로 `top`·`right`·`bottom`·`left` 를 주어 상자를
 * 줄인다(`inset` 축약형은 쓰지 않는다). 최대화와 스냅은 줄어든 상자를 채운다.
 */
export function WindowManagerViewport(props: ComponentProps<'div'>) {
  return <WindowLayer kind="viewport" {...props} />
}

/**
 * 부모 요소를 기준 영역으로 삼는 창 레이어. 창은 그 안에서만 보이고, 영역 밖으로 나간
 * 부분은 잘린다. 창에서 연 팝업은 body 로 portal 되므로 잘리지 않는다.
 *
 * - 부모 요소는 positioned(`position: relative` 등)여야 한다. 아니면 더 먼 조상을 채운다.
 * - 부모 요소가 스크롤 컨테이너이면 안 된다. 레이어가 내용과 함께 스크롤된다.
 * - 영역마다 `WindowManager.Root` 를 따로 둔다. 겹침 순서와 활성 창은 영역별로 독립이다.
 */
export function WindowManagerArea(props: ComponentProps<'div'>) {
  return <WindowLayer kind="area" {...props} />
}

/**
 * 끌고 있는 창을 지금 놓으면 차지할 자리를 보여 준다. 스냅 대상이 있을 때만 그려지고,
 * 끌고 있는 창 바로 아래에 놓인다. 모양은 사용처가 입힌다.
 */
export function WindowManagerSnapPreview(props: ComponentProps<'div'>) {
  const { style, ...rest } = props
  const store = useManagerStore()
  const target = useManagerState(store, (state) => state.snapPreview)
  const areaSize = useManagerState(store, (state) => state.areaSize)
  const layerEl = useManagerState(store, (state) => state.layerEl)
  const draggedIndex = useManagerState(store, (state) =>
    state.gesture ? state.layout.order.indexOf(state.gesture.id) : -1,
  )

  if (!target || !areaSize || !layerEl) return null
  const rect = snapTargetRect(target, areaSize)

  return createPortal(
    <div
      aria-hidden="true"
      data-window-snap-preview={target}
      {...rest}
      style={{
        ...style,
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        // 창은 짝수 z-index 를 쓴다. 끌고 있는 창 바로 아래의 홀수 자리에 놓는다.
        zIndex: (draggedIndex + 1) * 2 - 1,
        pointerEvents: 'none',
      }}
    />,
    layerEl,
  )
}

export interface WindowManagerApi {
  getLayout: () => WindowLayout
  setLayout: (layout: WindowLayout) => void
  /** 맨 앞으로 가져오고 활성화한다. 최소화된 창은 원래 배치로 되돌린다 */
  activate: (id: string) => void
  minimize: (id: string) => void
  maximize: (id: string) => void
  toggleMaximize: (id: string) => void
  snap: (id: string, zone: SnapZone) => void
  /** 최소화된 창은 되돌리며 활성화하고, 최대화·스냅된 창은 일반 상태로 돌린다 */
  restore: (id: string) => void
}

/** 배치를 읽고 쓰는 명령형 API. 값이 바뀌어도 다시 렌더링되지 않는다. */
export function useWindowManager(): WindowManagerApi {
  const store = useManagerStore()
  return useMemo(
    () => ({
      getLayout: store.getLayout,
      setLayout: store.setLayout,
      activate: store.activate,
      minimize: store.minimize,
      maximize: store.maximize,
      toggleMaximize: store.toggleMaximize,
      snap: store.snap,
      restore: store.restore,
    }),
    [store],
  )
}

/**
 * 열려 있는 창의 목록을 구독한다. 독이나 태스크바를 그릴 때 쓴다.
 * 연 순서대로이고, 창을 옮기는 동안에는 다시 렌더링되지 않는다.
 */
export function useWindowList(): WindowListItem[] {
  const store = useManagerStore()
  return useSyncExternalStore(store.subscribe, store.getWindowList, store.getWindowList)
}
