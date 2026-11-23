import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  useManagerState,
  useManagerStore,
  useWindowContext,
  WindowContext,
  type WindowContextValue,
} from './context.ts'
import { isInteractiveTarget, markHandledByWindow } from './events.ts'
import type { Rect, ResizeEdge, Size } from './geometry.ts'
import { effectiveRect, placementName, type PlacementName } from './placement.ts'
import type { DefaultRect, GestureType } from './store.ts'

/** 이만큼 움직인 뒤에야 이동을 시작한다. 타이틀바를 눌렀다 떼는 것만으로 창이 밀리지 않게 한다. */
const MOVE_THRESHOLD = 3

export interface WindowRootProps extends Omit<ComponentProps<'div'>, 'id'> {
  /** 관리자 안에서 창을 구분하는 키. 배치 저장에도 이 값이 쓰인다 */
  id: string
  /** 저장된 자리가 없을 때 쓰는 크기와 위치. 위치를 생략하면 계단식으로 놓인다 */
  defaultRect: DefaultRect
  /** 기본 200 × 120 */
  minSize?: Size
  maxSize?: Size
  /** 타이틀바 양 끝에서 잡을 수 없는 폭(버튼 영역). 이동 제약 계산에 쓰인다 */
  dragInset?: { left?: number; right?: number }
  open?: boolean
  /** 기본 true */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * 창 하나. React 트리에서는 선언한 자리에 있고, DOM 에서는 관리자의 레이어로 portal 된다.
 * 바깥을 누르거나 Escape 를 눌러도 닫히지 않는다. 최소화되면 내용은 마운트된 채 숨겨진다.
 */
export function WindowRoot(props: WindowRootProps) {
  const {
    id,
    defaultRect,
    minSize,
    maxSize,
    dragInset,
    open: openProp,
    defaultOpen = true,
    onOpenChange,
    style,
    children,
    onPointerDownCapture,
    onFocusCapture,
    ...rest
  } = props
  const store = useManagerStore()
  const titleId = useId()

  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    onOpenChangeRef.current?.(next)
  }, [])

  const defaultRectRef = useRef(defaultRect)
  defaultRectRef.current = defaultRect

  // register 보다 먼저 실행돼야 처음 자리 잡을 때 제약이 적용된다.
  useLayoutEffect(() => {
    store.setMeta(id, { minSize, maxSize, dragInset })
  })

  useLayoutEffect(() => {
    if (!open) return
    store.register(id, defaultRectRef.current)
    return () => store.unregister(id)
  }, [store, id, open])

  // 저장소가 들고 있는 참조를 그대로 구독하고, 실제 자리는 렌더에서 계산한다.
  const win = useManagerState(store, (state) => state.layout.windows[id])
  const areaSize = useManagerState(store, (state) => state.areaSize)
  const orderIndex = useManagerState(store, (state) => state.layout.order.indexOf(id))
  const active = useManagerState(store, (state) => state.activeId === id)
  const gesture = useManagerState(store, (state) =>
    state.gesture?.id === id ? state.gesture.type : null,
  )
  const layerEl = useManagerState(store, (state) => state.layerEl)

  const elementRef = useRef<HTMLDivElement | null>(null)
  const setElement = useCallback(
    (el: HTMLDivElement | null) => {
      elementRef.current = el
      store.setMeta(id, { el })
    },
    [store, id],
  )

  // 최소화에서 돌아온 창이 활성 창이면 포커스를 옮긴다. 숨겨진 요소에는 focus() 가 먹지 않으므로
  // 다시 보이게 된 커밋 뒤에 한다.
  const minimized = win?.placement === 'minimized'
  const wasMinimized = useRef(false)
  useLayoutEffect(() => {
    if (wasMinimized.current && !minimized && active) {
      elementRef.current?.focus({ preventScroll: true })
    }
    wasMinimized.current = minimized
  }, [minimized, active])

  const context = useMemo<WindowContextValue>(
    () => ({ id, titleId, store, setOpen }),
    [id, titleId, store, setOpen],
  )

  if (!open || !win || !layerEl || orderIndex < 0) return null

  const rect = effectiveRect(win, areaSize)

  return createPortal(
    <WindowContext.Provider value={context}>
      <div
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-window=""
        data-window-id={id}
        data-placement={placementName(win.placement)}
        data-active={active ? '' : undefined}
        data-dragging={gesture === 'move' ? '' : undefined}
        data-resizing={gesture === 'resize' ? '' : undefined}
        {...rest}
        ref={setElement}
        // 캡처 단계에서 받으므로, 이 창이 연 팝업(body 로 portal)을 눌러도 창이 활성화된다.
        onPointerDownCapture={(event) => {
          markHandledByWindow(event.nativeEvent)
          store.activate(id)
          onPointerDownCapture?.(event)
        }}
        onFocusCapture={(event) => {
          store.activate(id)
          onFocusCapture?.(event)
        }}
        style={
          {
            ...style,
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            // DOM 순서는 건드리지 않는다. 순서를 바꾸면 iframe 이 다시 로드되고 포커스를 잃는다.
            // 짝수만 쓰고, 사이의 홀수는 스냅 미리보기가 쓴다.
            zIndex: (orderIndex + 1) * 2,
            pointerEvents: 'auto',
            // hidden 속성은 사용처의 display 지정에 지므로 인라인으로 숨긴다.
            ...(minimized ? { display: 'none' } : null),
          } satisfies CSSProperties
        }
      >
        {children}
      </div>
    </WindowContext.Provider>,
    layerEl,
  )
}

export interface WindowApi {
  id: string
  placement: PlacementName
  active: boolean
  minimize: () => void
  maximize: () => void
  /** 최대화·스냅된 창을 일반 상태로 돌린다 */
  restore: () => void
  toggleMaximize: () => void
  close: () => void
}

/** 창 안에서 그 창의 상태와 명령을 얻는다. 버튼 라벨을 상태에 따라 바꿀 때 쓴다. */
export function useWindow(): WindowApi {
  const { id, store, setOpen } = useWindowContext()
  const placement = useManagerState(store, (state) =>
    placementName(state.layout.windows[id]?.placement ?? 'normal'),
  )
  const active = useManagerState(store, (state) => state.activeId === id)
  return useMemo(
    () => ({
      id,
      placement,
      active,
      minimize: () => store.minimize(id),
      maximize: () => store.maximize(id),
      restore: () => store.restore(id),
      toggleMaximize: () => store.toggleMaximize(id),
      close: () => setOpen(false),
    }),
    [id, placement, active, store, setOpen],
  )
}

interface GestureOptions {
  type: GestureType
  edge?: ResizeEdge
}

interface GestureSession {
  pointerId: number
  startX: number
  startY: number
  startRect: Rect
  started: boolean
}

type PointerHandler = (event: ReactPointerEvent<HTMLDivElement>) => void

/** 이동과 리사이즈가 함께 쓰는 포인터 제스처. 핸들 요소에 pointer capture 를 건다. */
function useWindowGesture({ type, edge }: GestureOptions) {
  const { id, store } = useWindowContext()
  const session = useRef<GestureSession | null>(null)

  const onPointerDown: PointerHandler = (event) => {
    if (event.button !== 0 || session.current) return
    const handle = event.currentTarget
    const target = event.target as Element
    // React 이벤트는 portal 을 타고 올라온다. 타이틀바 버튼이 연 메뉴를 누른 경우를 걸러 낸다.
    if (!handle.contains(target)) return
    if (type === 'move' && isInteractiveTarget(target, handle)) return
    // 최대화·스냅된 창은 영역에서 계산한 자리에 그려져 있다. 그 자리에서 시작한다.
    const startRect = store.getEffectiveRect(id)
    if (!startRect) return
    handle.setPointerCapture(event.pointerId)
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect,
      started: false,
    }
  }

  const onPointerMove: PointerHandler = (event) => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!current.started) {
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      if (type === 'move' && distance < MOVE_THRESHOLD) return
      current.started = true
      store.beginGesture(id, type)
      if (type === 'move') {
        // 최대화·스냅된 창이면 일반 크기로 풀어, 처음 누른 지점이 타이틀바 위에 오게 놓는다.
        // 이동량은 누른 지점부터 재므로, 첫 이동이 멀리 튀어도 타이틀바가 포인터를 따라온다.
        const detached = store.detach(id, store.toAreaPoint(current.startX, current.startY))
        if (detached) current.startRect = detached
      }
    }
    const delta = { x: event.clientX - current.startX, y: event.clientY - current.startY }
    if (type === 'move') {
      store.moveTo(id, { x: current.startRect.x + delta.x, y: current.startRect.y + delta.y })
      store.previewSnap(store.toAreaPoint(event.clientX, event.clientY))
    } else if (edge) {
      store.resizeFrom(id, current.startRect, edge, delta)
    }
  }

  const finish = (commit: boolean): PointerHandler => (event) => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    session.current = null
    const handle = event.currentTarget
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
    if (current.started) store.endGesture({ commit })
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish(true),
    // 취소되거나 capture 를 잃은 제스처는 스냅을 적용하지 않는다.
    onPointerCancel: finish(false),
    onLostPointerCapture: finish(false),
  }
}

function chain<E extends { defaultPrevented: boolean }>(
  ours: (event: E) => void,
  theirs?: (event: E) => void,
): (event: E) => void {
  if (!theirs) return ours
  return (event) => {
    theirs(event)
    if (!event.defaultPrevented) ours(event)
  }
}

function withGesture(
  props: ComponentProps<'div'>,
  gesture: ReturnType<typeof useWindowGesture>,
): ComponentProps<'div'> {
  return {
    ...props,
    onPointerDown: chain(gesture.onPointerDown, props.onPointerDown),
    onPointerMove: chain(gesture.onPointerMove, props.onPointerMove),
    onPointerUp: chain(gesture.onPointerUp, props.onPointerUp),
    onPointerCancel: chain(gesture.onPointerCancel, props.onPointerCancel),
    onLostPointerCapture: chain(gesture.onLostPointerCapture, props.onLostPointerCapture),
  }
}

export interface WindowTitlebarProps extends ComponentProps<'div'> {
  /** 더블클릭했을 때의 동작. 기본은 최대화 전환 */
  doubleClickAction?: 'maximize' | 'none'
}

/**
 * 창을 옮기는 손잡이. 안에 있는 버튼·링크·입력 요소와 `data-window-no-drag` 요소에서는
 * 이동이 시작되지 않고, 더블클릭도 무시한다. 최대화·스냅된 창을 끌면 일반 크기로 풀린다.
 */
export function WindowTitlebar(props: WindowTitlebarProps) {
  const { style, doubleClickAction = 'maximize', onDoubleClick, ...rest } = props
  const { id, store } = useWindowContext()
  const gesture = useWindowGesture({ type: 'move' })
  const setElement = useCallback(
    (el: HTMLDivElement | null) => store.setMeta(id, { titlebarEl: el }),
    [store, id],
  )
  const toggleMaximize = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (doubleClickAction !== 'maximize') return
    const handle = event.currentTarget
    const target = event.target as Element
    // 이동 시작과 같은 가드. 버튼이나 거기서 연 메뉴 항목의 더블클릭은 받지 않는다.
    if (!handle.contains(target) || isInteractiveTarget(target, handle)) return
    store.toggleMaximize(id)
  }
  return (
    <div
      data-window-titlebar=""
      {...withGesture(rest, gesture)}
      onDoubleClick={chain(toggleMaximize, onDoubleClick)}
      ref={setElement}
      style={{ touchAction: 'none', userSelect: 'none', ...style }}
    />
  )
}

export function WindowTitle(props: ComponentProps<'div'>) {
  const { titleId } = useWindowContext()
  return <div data-window-title="" {...props} id={titleId} />
}

export function WindowContent(props: ComponentProps<'div'>) {
  return <div data-window-content="" {...props} />
}

type ButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => void

export function WindowClose(props: ComponentProps<'button'>) {
  const { onClick, ...rest } = props
  const { setOpen } = useWindowContext()
  const close: ButtonClick = () => setOpen(false)
  return <button type="button" data-window-close="" {...rest} onClick={chain(close, onClick)} />
}

/** 창을 최소화한다. 최소화된 창을 다시 여는 곳(독 등)은 사용처가 `useWindowList` 로 만든다. */
export function WindowMinimize(props: ComponentProps<'button'>) {
  const { onClick, ...rest } = props
  const { id, store } = useWindowContext()
  const minimize: ButtonClick = () => store.minimize(id)
  return (
    <button type="button" data-window-minimize="" {...rest} onClick={chain(minimize, onClick)} />
  )
}

/** 최대화와 일반 상태를 오간다. 최대화 상태에서는 `data-maximized` 가 붙는다. */
export function WindowMaximize(props: ComponentProps<'button'>) {
  const { onClick, ...rest } = props
  const { id, store } = useWindowContext()
  const maximized = useManagerState(
    store,
    (state) => state.layout.windows[id]?.placement === 'maximized',
  )
  const toggle: ButtonClick = () => store.toggleMaximize(id)
  return (
    <button
      type="button"
      aria-pressed={maximized}
      data-window-maximize=""
      data-maximized={maximized ? '' : undefined}
      {...rest}
      onClick={chain(toggle, onClick)}
    />
  )
}

const HANDLE = 'var(--window-resize-handle-size, 8px)'
const OUTSET = `calc(${HANDLE} / -2)`
const CORNER = `calc(${HANDLE} * 2)`
const EDGE_INSET = `calc(${HANDLE} * 1.5)`

const HANDLE_STYLES: Record<ResizeEdge, CSSProperties> = {
  n: { top: OUTSET, left: EDGE_INSET, right: EDGE_INSET, height: HANDLE, cursor: 'ns-resize' },
  s: { bottom: OUTSET, left: EDGE_INSET, right: EDGE_INSET, height: HANDLE, cursor: 'ns-resize' },
  e: { right: OUTSET, top: EDGE_INSET, bottom: EDGE_INSET, width: HANDLE, cursor: 'ew-resize' },
  w: { left: OUTSET, top: EDGE_INSET, bottom: EDGE_INSET, width: HANDLE, cursor: 'ew-resize' },
  ne: { top: OUTSET, right: OUTSET, width: CORNER, height: CORNER, cursor: 'nesw-resize' },
  sw: { bottom: OUTSET, left: OUTSET, width: CORNER, height: CORNER, cursor: 'nesw-resize' },
  nw: { top: OUTSET, left: OUTSET, width: CORNER, height: CORNER, cursor: 'nwse-resize' },
  se: { bottom: OUTSET, right: OUTSET, width: CORNER, height: CORNER, cursor: 'nwse-resize' },
}

export interface WindowResizeHandleProps extends ComponentProps<'div'> {
  edge: ResizeEdge
}

/**
 * 변 또는 모서리의 리사이즈 손잡이. 창 테두리에 반쯤 걸쳐 놓이므로 창 요소에는
 * `overflow: hidden` 을 주지 않는다. 굵기는 `--window-resize-handle-size` 로 바꾼다.
 * 최대화된 창에서는 숨겨진다. 스냅된 창을 리사이즈하면 그 자리에서 일반 상태가 된다.
 */
export function WindowResizeHandle(props: WindowResizeHandleProps) {
  const { edge, style, ...rest } = props
  const { id, store } = useWindowContext()
  const gesture = useWindowGesture({ type: 'resize', edge })
  const maximized = useManagerState(
    store,
    (state) => state.layout.windows[id]?.placement === 'maximized',
  )
  return (
    <div
      aria-hidden="true"
      data-window-resize-handle={edge}
      {...withGesture(rest, gesture)}
      style={{
        position: 'absolute',
        touchAction: 'none',
        userSelect: 'none',
        ...HANDLE_STYLES[edge],
        ...style,
        ...(maximized ? { display: 'none' } : null),
      }}
    />
  )
}
