import { describe, expect, it } from 'vitest'
import {
  detachRect,
  effectiveRect,
  placementName,
  snapTargetAt,
  type PlacedWindow,
} from './placement.ts'

const area = { width: 1001, height: 800 }
const rect = { x: 100, y: 100, width: 300, height: 200 }

describe('effectiveRect', () => {
  it('일반 상태는 저장된 자리를 그대로 쓴다', () => {
    expect(effectiveRect({ rect, placement: 'normal' }, area)).toBe(rect)
  })

  it('최대화는 기준 영역을 채운다', () => {
    expect(effectiveRect({ rect, placement: 'maximized' }, area)).toEqual({
      x: 0,
      y: 0,
      width: 1001,
      height: 800,
    })
  })

  it('좌우 스냅은 영역을 빈틈없이 반으로 나눈다', () => {
    const left = effectiveRect({ rect, placement: { snap: 'left' } }, area)
    const right = effectiveRect({ rect, placement: { snap: 'right' } }, area)
    expect(left).toEqual({ x: 0, y: 0, width: 500, height: 800 })
    expect(right).toEqual({ x: 500, y: 0, width: 501, height: 800 })
    expect(left.width + right.width).toBe(area.width)
  })

  it('최소화된 창은 돌아갈 배치의 자리를 돌려준다', () => {
    const win: PlacedWindow = { rect, placement: 'minimized', restorePlacement: 'maximized' }
    expect(effectiveRect(win, area)).toEqual({ x: 0, y: 0, width: 1001, height: 800 })
    expect(effectiveRect({ rect, placement: 'minimized' }, area)).toBe(rect)
  })

  it('영역 크기를 모르면 저장된 자리를 쓴다', () => {
    expect(effectiveRect({ rect, placement: 'maximized' }, null)).toBe(rect)
  })
})

describe('placementName', () => {
  it('data 속성에 쓸 이름으로 바꾼다', () => {
    expect(placementName('normal')).toBe('normal')
    expect(placementName({ snap: 'left' })).toBe('snap-left')
    expect(placementName({ snap: 'right' })).toBe('snap-right')
  })
})

describe('snapTargetAt', () => {
  const options = { threshold: 8, top: true }

  it('가장자리에서 떨어져 있으면 대상이 없다', () => {
    expect(snapTargetAt({ x: 500, y: 400 }, area, options)).toBeNull()
    expect(snapTargetAt({ x: 9, y: 400 }, area, options)).toBeNull()
  })

  it('왼쪽·오른쪽 가장자리는 절반 스냅이다', () => {
    expect(snapTargetAt({ x: 8, y: 400 }, area, options)).toBe('left')
    expect(snapTargetAt({ x: 993, y: 400 }, area, options)).toBe('right')
  })

  it('위쪽 가장자리는 최대화다', () => {
    expect(snapTargetAt({ x: 500, y: 3 }, area, options)).toBe('maximize')
  })

  it('모서리에서는 좌우가 우선한다', () => {
    expect(snapTargetAt({ x: 2, y: 2 }, area, options)).toBe('left')
  })

  it('위쪽 스냅을 끄면 최대화 대상이 없다', () => {
    expect(snapTargetAt({ x: 500, y: 3 }, area, { threshold: 8, top: false })).toBeNull()
  })
})

describe('detachRect', () => {
  const maximized = { x: 0, y: 0, width: 1000, height: 800 }
  const noInset = { insetLeft: 0, insetRight: 0 }

  it('포인터가 타이틀바에서 차지하던 가로 비율을 유지한다', () => {
    const result = detachRect(maximized, rect, { x: 500, y: 16 }, noInset)
    // 비율 0.5 → 일반 폭 300 의 가운데(150)가 포인터 아래에 온다.
    expect(result).toEqual({ x: 350, y: 0, width: 300, height: 200 })
  })

  it('포인터가 버튼 영역 위에 놓이지 않게 한다', () => {
    const inset = { insetLeft: 0, insetRight: 70 }
    const result = detachRect(maximized, rect, { x: 990, y: 16 }, inset)
    // 잡을 수 있는 범위는 창 왼쪽에서 8 ~ 222px.
    expect(990 - result.x).toBe(222)
    const left = detachRect(maximized, rect, { x: 1, y: 16 }, inset)
    expect(1 - left.x).toBe(8)
  })

  it('크기는 일반 상태의 크기를 쓴다', () => {
    const result = detachRect(maximized, rect, { x: 200, y: 16 }, noInset)
    expect(result.width).toBe(300)
    expect(result.height).toBe(200)
  })
})
