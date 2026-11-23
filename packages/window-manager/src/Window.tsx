import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
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
 * 바깥을 누르거나 Escape 를 눌러도 닫히지 않는다.
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

  const rect = useManagerState(store, (state) => state.layout.windows[id]?.rect)
  const orderIndex = useManagerState(store, (state) => state.layout.order.indexOf(id))
  const active = useManagerState(store, (state) => state.activeId === id)
  const gesture = useManagerState(store, (state) =>
    state.gesture?.id === id ? state.gesture.type : null,
  )
  const layerEl = useManagerState(store, (state) => state.layerEl)

  const setElement = useCallback(
    (el: HTMLDivElement | null) => store.setMeta(id, { el }),
    [store, id],
  )

  const context = useMemo<WindowContextValue>(
    () => ({ id, titleId, store, setOpen }),
    [id, titleId, store, setOpen],
  )

  if (!open || !rect || !layerEl || orderIndex < 0) return null

  return createPortal(
    <WindowContext.Provider value={context}>
      <div
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-window=""
        data-window-id={id}
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
            zIndex: orderIndex + 1,
            pointerEvents: 'auto',
          } satisfies CSSProperties
        }
      >
        {children}
      </div>
    </WindowContext.Provider>,
    layerEl,
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
    const startRect = store.getState().layout.windows[id]?.rect
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
    const delta = { x: event.clientX - current.startX, y: event.clientY - current.startY }
    if (!current.started) {
      if (type === 'move' && Math.hypot(delta.x, delta.y) < MOVE_THRESHOLD) return
      current.started = true
      store.beginGesture(id, type)
    }
    if (type === 'move') {
      store.moveTo(id, { x: current.startRect.x + delta.x, y: current.startRect.y + delta.y })
    } else if (edge) {
      store.resizeFrom(id, current.startRect, edge, delta)
    }
  }

  const end: PointerHandler = (event) => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    session.current = null
    const handle = event.currentTarget
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
    if (current.started) store.endGesture()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  }
}

function chain(ours: PointerHandler, theirs?: PointerHandler): PointerHandler {
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

/**
 * 창을 옮기는 손잡이. 안에 있는 버튼·링크·입력 요소와 `data-window-no-drag` 요소에서는
 * 이동이 시작되지 않는다.
 */
export function WindowTitlebar(props: ComponentProps<'div'>) {
  const { style, ...rest } = props
  const { id, store } = useWindowContext()
  const gesture = useWindowGesture({ type: 'move' })
  const setElement = useCallback(
    (el: HTMLDivElement | null) => store.setMeta(id, { titlebarEl: el }),
    [store, id],
  )
  return (
    <div
      data-window-titlebar=""
      {...withGesture(rest, gesture)}
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

export function WindowClose(props: ComponentProps<'button'>) {
  const { onClick, ...rest } = props
  const { setOpen } = useWindowContext()
  return (
    <button
      type="button"
      data-window-close=""
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(false)
      }}
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
 */
export function WindowResizeHandle(props: WindowResizeHandleProps) {
  const { edge, style, ...rest } = props
  const gesture = useWindowGesture({ type: 'resize', edge })
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
      }}
    />
  )
}
