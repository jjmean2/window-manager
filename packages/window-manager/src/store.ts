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
import {
  detachRect,
  effectiveRect,
  isSamePlacement,
  placementName,
  snapTargetAt,
  type PlacedWindow,
  type PlacementName,
  type SnapOptions,
  type SnapTarget,
  type SnapZone,
  type VisiblePlacement,
} from './placement.ts'

export type WindowState = PlacedWindow

export interface WindowLayout {
  /** 닫힌 창의 자리도 남겨 두어, 다시 열면 같은 곳에 나타난다 */
  windows: Record<string, WindowState>
  /** 열려 있는 창의 겹침 순서. 끝이 맨 앞이다. 최소화된 창도 제자리를 지킨다 */
  order: string[]
}

export type GestureType = 'move' | 'resize'

export interface WindowManagerState {
  layout: WindowLayout
  activeId: string | null
  /** 열려 있는 창. 연 순서대로다 */
  openIds: readonly string[]
  layerEl: HTMLElement | null
  areaSize: Size | null
  gesture: { id: string; type: GestureType } | null
  /** 끌고 있는 창을 지금 놓으면 적용될 스냅 대상 */
  snapPreview: SnapTarget | null
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
  /**
   * 끌다가 포인터가 가장자리에 닿으면 스냅한다. 기본은 꺼져 있다.
   * 켜면 포인터가 좌우 가장자리에 닿은 채로는 창을 그쪽 화면 밖에 걸쳐 둘 수 없다.
   */
  snap?: boolean | Partial<SnapOptions>
}

export interface WindowListItem {
  id: string
  placement: PlacementName
  active: boolean
}

export const DEFAULT_MIN_SIZE: Size = { width: 200, height: 120 }

const EMPTY_LAYOUT: WindowLayout = { windows: {}, order: [] }
const CASCADE_ORIGIN = 48
const CASCADE_STEP = 28
const DEFAULT_SNAP: SnapOptions = { threshold: 8, top: true }

export type WindowManagerStore = ReturnType<typeof createWindowManagerStore>

function resolveSnapOptions(snap: WindowManagerOptions['snap']): SnapOptions | null {
  if (!snap) return null
  return snap === true ? DEFAULT_SNAP : { ...DEFAULT_SNAP, ...snap }
}

function topVisible(
  order: readonly string[],
  openIds: readonly string[],
  windows: Record<string, WindowState>,
): string | null {
  return (
    order.findLast((id) => openIds.includes(id) && windows[id]?.placement !== 'minimized') ?? null
  )
}

function leaveMinimized(win: WindowState): WindowState {
  return { rect: win.rect, placement: win.restorePlacement ?? 'normal' }
}

export function createWindowManagerStore(
  initialLayout: WindowLayout = EMPTY_LAYOUT,
  options: WindowManagerOptions = {},
) {
  const minVisibleWidth = options.minVisibleWidth ?? 64
  const fallbackTitlebarHeight = options.fallbackTitlebarHeight ?? 32
  const snapOptions = resolveSnapOptions(options.snap)

  let state: WindowManagerState = {
    // 저장된 order 는 그대로 믿는다. 열리지 않은 id 가 섞여 있어도 순서 계산에는 해가 없다.
    layout: initialLayout,
    activeId: null,
    openIds: [],
    layerEl: null,
    areaSize: null,
    gesture: null,
    snapPreview: null,
  }

  const listeners = new Set<() => void>()
  const meta = new Map<string, WindowMeta>()
  const pendingRemoval = new Set<string>()

  let layoutListener: ((layout: WindowLayout) => void) | null = null
  let emittedLayout = state.layout
  let emitScheduled = false
  let listCache: { key: string; value: WindowListItem[] } | null = null
  /** 제스처를 시작할 때의 일반 rect. 끌어서 스냅하면 이 자리를 돌아갈 곳으로 남긴다. */
  let gestureOrigin: Rect | null = null

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

  function withWindow(id: string, win: WindowState): WindowLayout {
    return { ...state.layout, windows: { ...state.layout.windows, [id]: win } }
  }

  /** 일반 상태의 자리를 바꾼다. 최대화·스냅 상태였다면 일반 상태로 돌아간다. */
  function setNormalRect(id: string, rect: Rect) {
    const current = state.layout.windows[id]
    if (!current) return
    if (current.placement === 'normal' && rectEquals(current.rect, rect)) return
    setState({ ...state, layout: withWindow(id, { rect, placement: 'normal' }) })
  }

  function setPlacement(id: string, placement: VisiblePlacement) {
    const current = state.layout.windows[id]
    if (!current || isSamePlacement(current.placement, placement)) return
    setState({ ...state, layout: withWindow(id, { rect: current.rect, placement }) })
  }

  /** rect 는 언제나 일반 상태의 자리이므로, 배치와 상관없이 모든 창에 적용한다. */
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

  /** 사라지는 창에 있던 포커스를 새 활성 창으로 옮긴다. */
  function handOverFocus(fromId: string, toId: string | null) {
    if (!toId || typeof document === 'undefined') return
    const focused = document.activeElement
    const from = meta.get(fromId)?.el
    if (focused === document.body || (from && focused && from.contains(focused))) {
      meta.get(toId)?.el?.focus({ preventScroll: true })
    }
  }

  function activate(id: string) {
    const { layout } = state
    const win = layout.windows[id]
    if (!win) return
    const isFront = layout.order[layout.order.length - 1] === id
    const minimized = win.placement === 'minimized'
    if (isFront && !minimized && state.activeId === id) return
    const windows = minimized ? { ...layout.windows, [id]: leaveMinimized(win) } : layout.windows
    const order = isFront ? layout.order : [...layout.order.filter((other) => other !== id), id]
    setState({
      ...state,
      activeId: id,
      layout: isFront && !minimized ? layout : { windows, order },
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
      const { layout } = state
      const openIds = state.openIds.includes(id) ? state.openIds : [...state.openIds, id]
      const existing = layout.windows[id]
      const inOrder = layout.order.includes(id)
      if (existing && inOrder && openIds === state.openIds) return

      let windows = layout.windows
      if (!existing) {
        const rect = fitToArea(id, resolveDefaultRect(defaults))
        windows = { ...windows, [id]: { rect, placement: 'normal' } }
      } else if (!inOrder && existing.placement === 'minimized') {
        // 최소화된 채 닫혔던 창을 다시 열면 보이는 상태로 연다.
        windows = { ...windows, [id]: leaveMinimized(existing) }
      }
      const order = inOrder ? layout.order : [...layout.order, id]
      const unchanged = windows === layout.windows && order === layout.order
      setState({
        ...state,
        openIds,
        layout: unchanged ? layout : { windows, order },
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
        const { layout } = state
        const openIds = state.openIds.filter((other) => other !== id)
        const order = layout.order.includes(id)
          ? layout.order.filter((other) => other !== id)
          : layout.order
        // 이동·리사이즈 도중에 닫히면 손잡이가 사라져 제스처가 끝나지 않는다. 여기서 풀어 준다.
        const gesture = state.gesture?.id === id ? null : state.gesture
        const wasActive = state.activeId === id
        const activeId = wasActive ? topVisible(order, openIds, layout.windows) : state.activeId
        setState({
          ...state,
          openIds,
          gesture,
          snapPreview: gesture ? state.snapPreview : null,
          layout: order === layout.order ? layout : { ...layout, order },
          activeId,
        })
        if (wasActive) handOverFocus(id, activeId)
        meta.delete(id)
      })
    },

    /** 맨 앞으로 가져오고 활성 창으로 만든다. 최소화된 창은 원래 배치로 되돌린다. */
    activate,

    deactivate() {
      if (state.activeId !== null) setState({ ...state, activeId: null })
    },

    maximize(id: string) {
      setPlacement(id, 'maximized')
    },

    snap(id: string, zone: SnapZone) {
      setPlacement(id, { snap: zone })
    },

    /** 최대화면 일반 상태로, 아니면 최대화로 바꾼다. */
    toggleMaximize(id: string) {
      const win = state.layout.windows[id]
      if (!win) return
      setPlacement(id, win.placement === 'maximized' ? 'normal' : 'maximized')
    },

    /** 최소화된 창은 원래 배치로 되돌리며 활성화하고, 최대화·스냅된 창은 일반 상태로 돌린다. */
    restore(id: string) {
      const win = state.layout.windows[id]
      if (!win) return
      if (win.placement === 'minimized') activate(id)
      else setPlacement(id, 'normal')
    },

    /** 창을 숨긴다. 내용은 마운트된 채 남고, 활성 창은 그다음 앞에 있는 창으로 넘어간다. */
    minimize(id: string) {
      const win = state.layout.windows[id]
      if (!win || win.placement === 'minimized') return
      const layout = withWindow(id, {
        rect: win.rect,
        placement: 'minimized',
        restorePlacement: win.placement,
      })
      const activeId =
        state.activeId === id
          ? topVisible(layout.order, state.openIds, layout.windows)
          : state.activeId
      const gesture = state.gesture?.id === id ? null : state.gesture
      setState({
        ...state,
        layout,
        activeId,
        gesture,
        snapPreview: gesture ? state.snapPreview : null,
      })
      handOverFocus(id, activeId)
    },

    /** 창이 실제로 그려지는 자리. 최대화·스냅이면 기준 영역에서 계산한 값이다. */
    getEffectiveRect(id: string): Rect | null {
      const win = state.layout.windows[id]
      return win ? effectiveRect(win, state.areaSize) : null
    },

    /**
     * 이동을 시작할 자리를 돌려준다. 최대화·스냅된 창이면 일반 크기로 풀어 포인터 아래에 놓는다.
     * pointer 는 기준 영역 좌표다.
     */
    detach(id: string, pointer: Point): Rect | null {
      const win = state.layout.windows[id]
      if (!win) return null
      if (win.placement === 'normal') return win.rect
      const from = effectiveRect(win, state.areaSize)
      const rect = fitToArea(id, detachRect(from, win.rect, pointer, constraintFor(id)))
      setNormalRect(id, rect)
      return rect
    },

    moveTo(id: string, position: Point) {
      const current = state.layout.windows[id]
      if (!current) return
      setNormalRect(id, fitToArea(id, roundRect({ ...current.rect, ...position })))
    },

    /**
     * 리사이즈 시작 시점의 rect 를 기준으로 계산한다. 누적 오차가 생기지 않는다.
     * 스냅된 창은 리사이즈하면 일반 상태가 된다. 최대화된 창은 리사이즈하지 않는다.
     */
    resizeFrom(id: string, startRect: Rect, edge: ResizeEdge, delta: Point) {
      const current = state.layout.windows[id]
      if (!current || current.placement === 'maximized' || current.placement === 'minimized') return
      const m = meta.get(id)
      const rect = resizeRect(startRect, edge, delta, {
        minSize: m?.minSize ?? DEFAULT_MIN_SIZE,
        maxSize: m?.maxSize,
        area: state.areaSize ?? undefined,
        constraint: constraintFor(id),
      })
      setNormalRect(id, roundRect(rect))
    },

    beginGesture(id: string, type: GestureType) {
      gestureOrigin = state.layout.windows[id]?.rect ?? null
      setState({ ...state, gesture: { id, type } })
    },

    /** 이동 중 포인터 위치(기준 영역 좌표)로 스냅 대상을 갱신한다. 스냅이 꺼져 있으면 아무 일도 하지 않는다. */
    previewSnap(pointer: Point) {
      if (!snapOptions || !state.areaSize || state.gesture?.type !== 'move') return
      const snapPreview = snapTargetAt(pointer, state.areaSize, snapOptions)
      if (snapPreview !== state.snapPreview) setState({ ...state, snapPreview })
    },

    /**
     * 제스처를 끝낸다. 스냅 대상이 있으면 적용한다.
     * 취소된 제스처(`commit: false`)는 미리보기만 지운다.
     */
    endGesture({ commit = true }: { commit?: boolean } = {}) {
      const { gesture, snapPreview } = state
      if (!gesture) return
      const win = state.layout.windows[gesture.id]
      const target = commit && gesture.type === 'move' ? snapPreview : null
      // 스냅할 때는 끌려온 자리(가장자리)가 아니라 끌기 전의 자리를 일반 상태의 자리로 남긴다.
      const layout =
        target && win
          ? withWindow(gesture.id, {
              rect: gestureOrigin ?? win.rect,
              placement: target === 'maximize' ? 'maximized' : { snap: target },
            })
          : state.layout
      gestureOrigin = null
      setState({ ...state, gesture: null, snapPreview: null, layout })
      scheduleLayoutEmit()
    },

    /** 화면 좌표를 기준 영역 좌표로 바꾼다. */
    toAreaPoint(clientX: number, clientY: number): Point {
      const origin = state.layerEl?.getBoundingClientRect()
      return { x: clientX - (origin?.left ?? 0), y: clientY - (origin?.top ?? 0) }
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

    /**
     * 열려 있는 창의 목록. 연 순서대로이고, 활성화해도 순서가 바뀌지 않아 독에 쓰기 좋다.
     * 배치나 활성 창이 바뀌지 않는 한 같은 배열을 돌려준다.
     */
    getWindowList(): WindowListItem[] {
      const value = state.openIds.map((id) => ({
        id,
        placement: placementName(state.layout.windows[id]?.placement ?? 'normal'),
        active: state.activeId === id,
      }))
      const key = value.map((item) => `${item.id}:${item.placement}:${item.active}`).join('|')
      if (listCache?.key !== key) listCache = { key, value }
      return listCache.value
    },

    /** 저장해 둔 배치를 통째로 적용한다. 순서에는 지금 열려 있는 창만 남긴다. */
    setLayout(layout: WindowLayout) {
      const { openIds } = state
      const known = layout.order.filter((id) => openIds.includes(id))
      const missing = openIds.filter((id) => !known.includes(id) && layout.windows[id])
      const windows = { ...layout.windows }
      // 새 배치에 없는 열린 창은 지금 자리를 유지한다.
      const kept: string[] = []
      for (const id of openIds) {
        const current = state.layout.windows[id]
        if (!windows[id] && current) {
          windows[id] = current
          kept.push(id)
        }
      }
      const order = [...known, ...missing, ...kept]
      const activeId =
        state.activeId && order.includes(state.activeId) && windows[state.activeId]?.placement !== 'minimized'
          ? state.activeId
          : null
      setState({
        ...state,
        layout: reclampAll({ windows, order }),
        activeId,
        gesture: null,
        snapPreview: null,
      })
    },
  }
}
