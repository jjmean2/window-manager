import {
  clampPosition,
  rectEquals,
  resizeRect,
  roundRect,
  type Point,
  type ReachConstraint,
  type Rect,
  type ResizeEdge,
  type Size,
} from './geometry.ts'

/** 1단계에서는 'normal' 만 쓴다. 나머지는 최소화·최대화·스냅을 위해 자리만 잡아 둔다. */
export type WindowPlacement =
  | 'normal'
  | 'minimized'
  | 'maximized'
  | { snap: 'left' | 'right' | 'top' | 'bottom' }

export interface WindowState {
  /** 기준 영역의 왼쪽 위를 원점으로 한 좌표 */
  rect: Rect
  placement: WindowPlacement
  /** normal 로 돌아갈 자리 */
  restoreRect?: Rect
}

export interface WindowLayout {
  /** 닫힌 창의 자리도 남겨 두어, 다시 열면 같은 곳에 나타난다 */
  windows: Record<string, WindowState>
  /** 열려 있는 창의 겹침 순서. 끝이 맨 앞이다 */
  order: string[]
}

export type GestureType = 'move' | 'resize'

export interface WindowManagerState {
  layout: WindowLayout
  activeId: string | null
  layerEl: HTMLElement | null
  areaSize: Size | null
  gesture: { id: string; type: GestureType } | null
}

export interface WindowMeta {
  minSize?: Size
  maxSize?: Size
  dragInset?: { left?: number; right?: number }
  el?: HTMLElement | null
  titlebarEl?: HTMLElement | null
}

export interface DefaultRect extends Size {
  x?: number
  y?: number
}

export interface WindowManagerOptions {
  /** 영역 밖으로 나가도 남겨 둘 타이틀바의 가로 폭. 기본 64 */
  minVisibleWidth?: number
  /** 타이틀바를 아직 재지 못했을 때 쓰는 높이. 기본 32 */
  fallbackTitlebarHeight?: number
}

export const DEFAULT_MIN_SIZE: Size = { width: 200, height: 120 }

const EMPTY_LAYOUT: WindowLayout = { windows: {}, order: [] }
const CASCADE_ORIGIN = 48
const CASCADE_STEP = 28

export type WindowManagerStore = ReturnType<typeof createWindowManagerStore>

export function createWindowManagerStore(
  initialLayout: WindowLayout = EMPTY_LAYOUT,
  options: WindowManagerOptions = {},
) {
  const minVisibleWidth = options.minVisibleWidth ?? 64
  const fallbackTitlebarHeight = options.fallbackTitlebarHeight ?? 32

  let state: WindowManagerState = {
    // 저장된 order 는 그대로 믿는다. 열리지 않은 id 가 섞여 있어도 순서 계산에는 해가 없다.
    layout: initialLayout,
    activeId: null,
    layerEl: null,
    areaSize: null,
    gesture: null,
  }

  const listeners = new Set<() => void>()
  const meta = new Map<string, WindowMeta>()
  const openIds = new Set<string>()
  const pendingRemoval = new Set<string>()

  let layoutListener: ((layout: WindowLayout) => void) | null = null
  let emittedLayout = state.layout
  let emitScheduled = false

  function setState(next: WindowManagerState) {
    if (next === state) return
    const layoutChanged = next.layout !== state.layout
    state = next
    for (const listener of listeners) listener()
    if (layoutChanged) scheduleLayoutEmit()
  }

  /** 제스처 도중에는 알리지 않고, 끝났을 때 한 번만 알린다. */
  function scheduleLayoutEmit() {
    if (emitScheduled || state.gesture) return
    emitScheduled = true
    queueMicrotask(() => {
      emitScheduled = false
      if (state.gesture || state.layout === emittedLayout) return
      emittedLayout = state.layout
      layoutListener?.(state.layout)
    })
  }

  function constraintFor(id: string): ReachConstraint {
    const m = meta.get(id)
    return {
      minVisibleWidth,
      titlebarHeight: m?.titlebarEl?.offsetHeight || fallbackTitlebarHeight,
      insetLeft: m?.dragInset?.left ?? 0,
      insetRight: m?.dragInset?.right ?? 0,
    }
  }

  function fitToArea(id: string, rect: Rect, area: Size | null = state.areaSize): Rect {
    return area ? clampPosition(rect, area, constraintFor(id)) : rect
  }

  function setRect(id: string, rect: Rect) {
    const current = state.layout.windows[id]
    if (!current || rectEquals(current.rect, rect)) return
    setState({
      ...state,
      layout: {
        ...state.layout,
        windows: { ...state.layout.windows, [id]: { ...current, rect } },
      },
    })
  }

  function reclampAll(layout: WindowLayout, area: Size | null = state.areaSize): WindowLayout {
    let windows = layout.windows
    for (const [id, win] of Object.entries(layout.windows)) {
      const rect = fitToArea(id, win.rect, area)
      if (rect !== win.rect) {
        if (windows === layout.windows) windows = { ...layout.windows }
        windows[id] = { ...win, rect }
      }
    }
    return windows === layout.windows ? layout : { ...layout, windows }
  }

  function resolveDefaultRect(defaults: DefaultRect): Rect {
    const offset = CASCADE_ORIGIN + (state.layout.order.length % 8) * CASCADE_STEP
    return roundRect({
      x: defaults.x ?? offset,
      y: defaults.y ?? offset,
      width: defaults.width,
      height: defaults.height,
    })
  }

  return {
    getState: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /**
     * 붙는 시점의 배치를 기준으로 삼는다. 그 전에 일어난 변화(처음 mount 될 때의 창 등록)는
     * 알리지 않는다. 리스너가 붙는 effect 와 알림 마이크로태스크의 순서에 결과가 좌우되지 않는다.
     */
    setLayoutListener(listener: ((layout: WindowLayout) => void) | null) {
      layoutListener = listener
      if (listener) emittedLayout = state.layout
    },

    setMeta(id: string, patch: WindowMeta) {
      meta.set(id, { ...meta.get(id), ...patch })
    },

    /**
     * 창을 연다. 저장된 자리가 있으면 그대로 쓰고, order 에 이미 있으면 순서도 유지한다.
     * 새로 열리는 창은 맨 앞에 오고 활성 창이 된다.
     */
    register(id: string, defaults: DefaultRect) {
      pendingRemoval.delete(id)
      openIds.add(id)
      const { layout } = state
      const existing = layout.windows[id]
      const inOrder = layout.order.includes(id)
      if (existing && inOrder) return
      const windows = existing
        ? layout.windows
        : {
            ...layout.windows,
            [id]: {
              rect: fitToArea(id, resolveDefaultRect(defaults)),
              placement: 'normal' as const,
            },
          }
      const order = inOrder ? layout.order : [...layout.order, id]
      setState({
        ...state,
        layout: { windows, order },
        activeId: inOrder ? state.activeId : id,
      })
    },

    /**
     * 창을 닫는다. 실제 제거는 한 박자 늦춘다. StrictMode 의 mount → unmount → mount 에서
     * 곧바로 다시 register 되면 순서를 잃지 않게 하기 위해서다.
     */
    unregister(id: string) {
      pendingRemoval.add(id)
      queueMicrotask(() => {
        if (!pendingRemoval.delete(id)) return
        openIds.delete(id)
        meta.delete(id)
        // 이동·리사이즈 도중에 닫히면 손잡이가 사라져 제스처가 끝나지 않는다. 여기서 풀어 준다.
        const gesture = state.gesture?.id === id ? null : state.gesture
        const { layout } = state
        if (!layout.order.includes(id)) {
          if (gesture !== state.gesture) setState({ ...state, gesture })
          return
        }
        const order = layout.order.filter((other) => other !== id)
        const activeId =
          state.activeId === id ? (order.findLast((other) => openIds.has(other)) ?? null) : state.activeId
        setState({ ...state, layout: { ...layout, order }, activeId, gesture })
        // 닫힌 창에 있던 포커스가 body 로 떨어졌으면 새 활성 창으로 옮긴다.
        if (activeId && typeof document !== 'undefined' && document.activeElement === document.body) {
          meta.get(activeId)?.el?.focus({ preventScroll: true })
        }
      })
    },

    /** 맨 앞으로 가져오고 활성 창으로 만든다. */
    activate(id: string) {
      const { layout } = state
      if (!layout.windows[id]) return
      const isFront = layout.order[layout.order.length - 1] === id
      if (isFront && state.activeId === id) return
      setState({
        ...state,
        activeId: id,
        layout: isFront
          ? layout
          : { ...layout, order: [...layout.order.filter((other) => other !== id), id] },
      })
    },

    deactivate() {
      if (state.activeId !== null) setState({ ...state, activeId: null })
    },

    moveTo(id: string, position: Point) {
      const current = state.layout.windows[id]
      if (!current) return
      setRect(id, fitToArea(id, roundRect({ ...current.rect, ...position })))
    },

    /** 리사이즈 시작 시점의 rect 를 기준으로 계산한다. 누적 오차가 생기지 않는다. */
    resizeFrom(id: string, startRect: Rect, edge: ResizeEdge, delta: Point) {
      const m = meta.get(id)
      const rect = resizeRect(startRect, edge, delta, {
        minSize: m?.minSize ?? DEFAULT_MIN_SIZE,
        maxSize: m?.maxSize,
        area: state.areaSize ?? undefined,
        constraint: constraintFor(id),
      })
      setRect(id, roundRect(rect))
    },

    beginGesture(id: string, type: GestureType) {
      setState({ ...state, gesture: { id, type } })
    },

    endGesture() {
      if (!state.gesture) return
      setState({ ...state, gesture: null })
      scheduleLayoutEmit()
    },

    setLayerEl(layerEl: HTMLElement | null) {
      if (state.layerEl !== layerEl) setState({ ...state, layerEl })
    },

    /** 기준 영역의 크기가 바뀌면 모든 창에 이동 제약을 다시 적용한다. */
    setAreaSize(areaSize: Size | null) {
      const prev = state.areaSize
      if (prev?.width === areaSize?.width && prev?.height === areaSize?.height) return
      setState({ ...state, areaSize, layout: reclampAll(state.layout, areaSize) })
    },

    getLayout: () => state.layout,

    /** 저장해 둔 배치를 통째로 적용한다. 순서에는 지금 열려 있는 창만 남긴다. */
    setLayout(layout: WindowLayout) {
      const known = layout.order.filter((id) => openIds.has(id))
      const missing = [...openIds].filter((id) => !known.includes(id) && layout.windows[id])
      const windows = { ...layout.windows }
      // 새 배치에 없는 열린 창은 지금 자리를 유지한다.
      const kept: string[] = []
      for (const id of openIds) {
        if (!windows[id] && state.layout.windows[id]) {
          windows[id] = state.layout.windows[id]
          kept.push(id)
        }
      }
      const order = [...known, ...missing, ...kept]
      const next = reclampAll({ windows, order })
      setState({
        ...state,
        layout: next,
        activeId: state.activeId && order.includes(state.activeId) ? state.activeId : null,
      })
    },
  }
}
