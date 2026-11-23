import { clamp, type Point, type ReachConstraint, type Rect, type Size } from './geometry.ts'

export type SnapZone = 'left' | 'right'

export type WindowPlacement = 'normal' | 'minimized' | 'maximized' | { snap: SnapZone }

/** 화면에 보이는 배치. 최소화에서 돌아갈 곳으로 기억해 두는 값이기도 하다. */
export type VisiblePlacement = Exclude<WindowPlacement, 'minimized'>

/** 끌다가 놓으면 적용되는 스냅 대상. 위쪽 가장자리는 최대화다. */
export type SnapTarget = SnapZone | 'maximize'

export type PlacementName = 'normal' | 'minimized' | 'maximized' | 'snap-left' | 'snap-right'

export interface PlacedWindow {
  /** 일반(normal) 상태일 때의 자리. 최대화·스냅 중에도 바뀌지 않는다 */
  rect: Rect
  placement: WindowPlacement
  /** 최소화되기 전의 배치 */
  restorePlacement?: VisiblePlacement
}

export function placementName(placement: WindowPlacement): PlacementName {
  if (typeof placement === 'string') return placement
  return placement.snap === 'left' ? 'snap-left' : 'snap-right'
}

export function isSamePlacement(a: WindowPlacement, b: WindowPlacement): boolean {
  return placementName(a) === placementName(b)
}

export function snapZoneRect(zone: SnapZone, area: Size): Rect {
  const half = Math.floor(area.width / 2)
  return zone === 'left'
    ? { x: 0, y: 0, width: half, height: area.height }
    : { x: half, y: 0, width: area.width - half, height: area.height }
}

export function snapTargetRect(target: SnapTarget, area: Size): Rect {
  return target === 'maximize'
    ? { x: 0, y: 0, width: area.width, height: area.height }
    : snapZoneRect(target, area)
}

/**
 * 창이 실제로 그려지는 자리. 최대화와 스냅은 저장된 rect 가 아니라 기준 영역에서 계산하므로,
 * 영역 크기가 바뀌면 저절로 따라간다. 최소화된 창은 돌아갈 배치의 자리를 돌려준다.
 */
export function effectiveRect(win: PlacedWindow, area: Size | null): Rect {
  const placement =
    win.placement === 'minimized' ? (win.restorePlacement ?? 'normal') : win.placement
  if (!area || placement === 'normal') return win.rect
  if (placement === 'maximized') return snapTargetRect('maximize', area)
  return snapZoneRect(placement.snap, area)
}

export interface SnapOptions {
  /** 포인터가 가장자리에서 이 거리 안에 들어오면 스냅 대상이 된다 */
  threshold: number
  /** 위쪽 가장자리를 최대화 대상으로 쓸지 */
  top: boolean
}

/** 포인터 위치(기준 영역 좌표)가 가리키는 스냅 대상. 모서리에서는 좌우가 위쪽보다 우선한다. */
export function snapTargetAt(point: Point, area: Size, options: SnapOptions): SnapTarget | null {
  if (point.x <= options.threshold) return 'left'
  if (point.x >= area.width - options.threshold) return 'right'
  if (options.top && point.y <= options.threshold) return 'maximize'
  return null
}

/**
 * 최대화·스냅된 창을 끌어서 풀 때의 시작 자리. 포인터가 타이틀바에서 차지하던 가로 비율을
 * 유지하되, 잡을 수 있는 부분(버튼 영역 제외) 위에 남게 한다. 위쪽은 원래 자리 그대로다.
 */
export function detachRect(
  from: Rect,
  normal: Rect,
  pointer: Point,
  constraint: Pick<ReachConstraint, 'insetLeft' | 'insetRight'>,
): Rect {
  const ratio = from.width > 0 ? (pointer.x - from.x) / from.width : 0.5
  const margin = 8
  const lo = constraint.insetLeft + margin
  const hi = Math.max(lo, normal.width - constraint.insetRight - margin)
  const offset = clamp(ratio * normal.width, lo, hi)
  return {
    x: Math.round(pointer.x - offset),
    y: from.y,
    width: normal.width,
    height: normal.height,
  }
}
