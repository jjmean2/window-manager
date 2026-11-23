export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

/**
 * 창이 기준 영역을 벗어나도 다시 잡을 수 있도록 남겨 둘 타이틀바의 조건.
 * 좌표는 모두 기준 영역의 왼쪽 위를 원점으로 한다.
 */
export interface ReachConstraint {
  /** 영역 안에 남아야 하는, 타이틀바에서 잡을 수 있는 부분의 가로 폭 */
  minVisibleWidth: number
  /** 타이틀바 높이. 창 위쪽으로 이만큼은 영역 안에 남는다 */
  titlebarHeight: number
  /** 타이틀바 왼쪽 끝에서 잡을 수 없는 폭 (버튼 등) */
  insetLeft: number
  /** 타이틀바 오른쪽 끝에서 잡을 수 없는 폭 (버튼 등) */
  insetRight: number
}

/** lo > hi 로 범위가 뒤집히면 lo 를 따른다. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi))
}

export function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

/**
 * 크기는 그대로 두고 위치만 옮겨, 타이틀바의 잡을 수 있는 부분이 영역 안에 남게 한다.
 * - 위: 타이틀바가 영역 위로 넘어가지 않는다.
 * - 아래: 타이틀바 높이만큼은 영역 안에 남는다.
 * - 좌우: 잡을 수 있는 폭이 minVisibleWidth 만큼 남는다.
 */
export function clampPosition(rect: Rect, area: Size, constraint: ReachConstraint): Rect {
  const grabbable = Math.max(0, rect.width - constraint.insetLeft - constraint.insetRight)
  const visible = Math.min(constraint.minVisibleWidth, grabbable)
  const minX = visible + constraint.insetRight - rect.width
  const maxX = area.width - visible - constraint.insetLeft
  const maxY = Math.max(0, area.height - constraint.titlebarHeight)
  const x = clamp(rect.x, minX, maxX)
  const y = clamp(rect.y, 0, maxY)
  return x === rect.x && y === rect.y ? rect : { ...rect, x, y }
}

export interface ResizeOptions {
  minSize: Size
  maxSize?: Size
  /** 둘 다 주면 리사이즈 중에도 타이틀바가 닿는 위치에 남도록 제한한다 */
  area?: Size
  constraint?: ReachConstraint
}

/**
 * 리사이즈 시작 시점의 rect 와 포인터 이동량으로 새 rect 를 구한다.
 * 잡지 않은 쪽 변은 움직이지 않는다. 최소 크기에 닿으면 잡은 변이 멈추고 창은 밀리지 않는다.
 */
export function resizeRect(
  start: Rect,
  edge: ResizeEdge,
  delta: Point,
  options: ResizeOptions,
): Rect {
  const { minSize, maxSize, area, constraint } = options
  const maxWidth = maxSize?.width ?? Infinity
  const maxHeight = maxSize?.height ?? Infinity
  const bounded = area && constraint ? { area, constraint } : null

  let left = start.x
  let right = start.x + start.width
  let top = start.y
  let bottom = start.y + start.height

  if (edge.includes('e')) {
    let lowest = left + minSize.width
    if (bounded) {
      // 창이 왼쪽으로 걸쳐 있을 때 오른쪽 변을 당겨 타이틀바가 사라지지 않게 한다.
      lowest = Math.max(lowest, bounded.constraint.minVisibleWidth + bounded.constraint.insetRight)
    }
    right = Math.max(Math.min(right + delta.x, left + maxWidth), lowest)
  }

  if (edge.includes('w')) {
    let highest = right - minSize.width
    if (bounded) {
      highest = Math.min(
        highest,
        bounded.area.width - bounded.constraint.minVisibleWidth - bounded.constraint.insetLeft,
      )
    }
    left = Math.min(Math.max(left + delta.x, right - maxWidth), highest)
  }

  if (edge.includes('s')) {
    bottom = Math.max(Math.min(bottom + delta.y, top + maxHeight), top + minSize.height)
  }

  if (edge.includes('n')) {
    let highest = bottom - minSize.height
    let lowest = bottom - maxHeight
    if (bounded) {
      highest = Math.min(highest, bounded.area.height - bounded.constraint.titlebarHeight)
      lowest = Math.max(lowest, 0)
    }
    top = Math.min(Math.max(top + delta.y, lowest), highest)
  }

  return { x: left, y: top, width: right - left, height: bottom - top }
}
