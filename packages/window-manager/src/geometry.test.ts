import { describe, expect, it } from 'vitest'
import {
  clampPosition,
  containPosition,
  resizeRect,
  type ReachConstraint,
  type Rect,
} from './geometry.ts'

const area = { width: 1000, height: 800 }
const constraint: ReachConstraint = {
  minVisibleWidth: 64,
  titlebarHeight: 32,
  insetLeft: 0,
  insetRight: 0,
}
const rect: Rect = { x: 100, y: 100, width: 300, height: 200 }

describe('clampPosition', () => {
  it('영역 안에 있는 창은 그대로 둔다', () => {
    expect(clampPosition(rect, area, constraint)).toBe(rect)
  })

  it('왼쪽으로 나가도 타이틀바가 minVisibleWidth 만큼 남는다', () => {
    const result = clampPosition({ ...rect, x: -5000 }, area, constraint)
    expect(result.x + result.width).toBe(64)
  })

  it('오른쪽으로 나가도 타이틀바가 minVisibleWidth 만큼 남는다', () => {
    const result = clampPosition({ ...rect, x: 5000 }, area, constraint)
    expect(area.width - result.x).toBe(64)
  })

  it('타이틀바는 영역 위로 넘어가지 않는다', () => {
    expect(clampPosition({ ...rect, y: -50 }, area, constraint).y).toBe(0)
  })

  it('아래로 나가도 타이틀바 높이만큼은 남는다', () => {
    expect(clampPosition({ ...rect, y: 5000 }, area, constraint).y).toBe(800 - 32)
  })

  it('버튼 영역은 남는 폭으로 치지 않는다', () => {
    const withButtons = { ...constraint, insetRight: 70 }
    const left = clampPosition({ ...rect, x: -5000 }, area, withButtons)
    // 보이는 134px 중 오른쪽 70px 은 버튼이고, 잡을 수 있는 폭은 64px 이다.
    expect(left.x + left.width).toBe(134)
    const right = clampPosition({ ...rect, x: 5000 }, area, withButtons)
    expect(area.width - right.x).toBe(64)
  })

  it('잡을 수 있는 폭이 minVisibleWidth 보다 좁으면 그 폭 전체를 남긴다', () => {
    const narrow = { ...rect, width: 100, x: -5000 }
    const result = clampPosition(narrow, area, { ...constraint, insetRight: 70 })
    // 잡을 수 있는 폭은 30px 이고, 그 오른쪽에 버튼 70px 이 있다.
    expect(result.x).toBe(0)
  })

  it('크기는 바꾸지 않는다', () => {
    const result = clampPosition({ ...rect, x: 5000, y: 5000 }, area, constraint)
    expect(result.width).toBe(300)
    expect(result.height).toBe(200)
  })
})

describe('containPosition', () => {
  it('영역 안에 있는 창은 그대로 둔다', () => {
    expect(containPosition(rect, area)).toBe(rect)
  })

  it('창 전체가 영역 안에 머물게 한다', () => {
    expect(containPosition({ ...rect, x: -50, y: -50 }, area)).toMatchObject({ x: 0, y: 0 })
    expect(containPosition({ ...rect, x: 5000, y: 5000 }, area)).toMatchObject({
      x: 1000 - 300,
      y: 800 - 200,
    })
  })

  it('영역보다 큰 창은 왼쪽 위에 맞추고 크기는 바꾸지 않는다', () => {
    const big = { x: 300, y: 300, width: 1500, height: 900 }
    expect(containPosition(big, area)).toEqual({ x: 0, y: 0, width: 1500, height: 900 })
  })
})

describe('resizeRect (contain)', () => {
  const options = { minSize: { width: 200, height: 120 }, area, constraint, contain: true }

  it('네 변이 영역을 넘지 않는다', () => {
    expect(resizeRect(rect, 'se', { x: 5000, y: 5000 }, options)).toEqual({
      x: 100,
      y: 100,
      width: 900,
      height: 700,
    })
    expect(resizeRect(rect, 'nw', { x: -5000, y: -5000 }, options)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })

  it('영역 안에서는 최소 크기까지 줄일 수 있다', () => {
    expect(resizeRect(rect, 'se', { x: -5000, y: -5000 }, options)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 120,
    })
  })

  it('최소 크기가 남은 공간보다 크면 최소 크기를 따른다', () => {
    const nearEdge = { x: 900, y: 100, width: 200, height: 200 }
    expect(resizeRect(nearEdge, 'e', { x: -50, y: 0 }, options).width).toBe(200)
  })

  it('contain 이 아니면 변이 영역 밖으로 나갈 수 있다', () => {
    const loose = { ...options, contain: false }
    expect(resizeRect(rect, 'e', { x: 5000, y: 0 }, loose).width).toBe(5300)
  })
})

describe('resizeRect', () => {
  const options = { minSize: { width: 200, height: 120 } }

  it('동쪽 변은 왼쪽 변을 고정한 채 폭만 바꾼다', () => {
    expect(resizeRect(rect, 'e', { x: 50, y: 999 }, options)).toEqual({ ...rect, width: 350 })
  })

  it('남쪽 변은 위쪽 변을 고정한 채 높이만 바꾼다', () => {
    expect(resizeRect(rect, 's', { x: 999, y: 40 }, options)).toEqual({ ...rect, height: 240 })
  })

  it('서쪽 변은 오른쪽 변을 고정한다', () => {
    const result = resizeRect(rect, 'w', { x: -50, y: 0 }, options)
    expect(result).toEqual({ x: 50, y: 100, width: 350, height: 200 })
    expect(result.x + result.width).toBe(rect.x + rect.width)
  })

  it('북쪽 변은 아래쪽 변을 고정한다', () => {
    const result = resizeRect(rect, 'n', { x: 0, y: -30 }, options)
    expect(result).toEqual({ x: 100, y: 70, width: 300, height: 230 })
    expect(result.y + result.height).toBe(rect.y + rect.height)
  })

  it('모서리는 두 변을 함께 움직인다', () => {
    expect(resizeRect(rect, 'nw', { x: -10, y: -20 }, options)).toEqual({
      x: 90,
      y: 80,
      width: 310,
      height: 220,
    })
    expect(resizeRect(rect, 'se', { x: 10, y: 20 }, options)).toEqual({
      x: 100,
      y: 100,
      width: 310,
      height: 220,
    })
    expect(resizeRect(rect, 'ne', { x: 10, y: -20 }, options)).toEqual({
      x: 100,
      y: 80,
      width: 310,
      height: 220,
    })
    expect(resizeRect(rect, 'sw', { x: -10, y: 20 }, options)).toEqual({
      x: 90,
      y: 100,
      width: 310,
      height: 220,
    })
  })

  it('서쪽 변이 최소 크기에 닿으면 멈추고 창은 밀리지 않는다', () => {
    const result = resizeRect(rect, 'w', { x: 500, y: 0 }, options)
    expect(result.width).toBe(200)
    expect(result.x + result.width).toBe(rect.x + rect.width)
  })

  it('북쪽 변이 최소 크기에 닿으면 멈추고 창은 밀리지 않는다', () => {
    const result = resizeRect(rect, 'n', { x: 0, y: 500 }, options)
    expect(result.height).toBe(120)
    expect(result.y + result.height).toBe(rect.y + rect.height)
  })

  it('동쪽·남쪽 변도 최소 크기에서 멈춘다', () => {
    const result = resizeRect(rect, 'se', { x: -500, y: -500 }, options)
    expect(result).toEqual({ x: 100, y: 100, width: 200, height: 120 })
  })

  it('최대 크기를 넘지 않는다', () => {
    const limited = { ...options, maxSize: { width: 400, height: 300 } }
    expect(resizeRect(rect, 'se', { x: 500, y: 500 }, limited)).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    })
    const result = resizeRect(rect, 'nw', { x: -500, y: -500 }, limited)
    expect(result).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('북쪽 변은 영역 위로 넘어가지 않는다', () => {
    const result = resizeRect(rect, 'n', { x: 0, y: -500 }, { ...options, area, constraint })
    expect(result.y).toBe(0)
    expect(result.y + result.height).toBe(rect.y + rect.height)
  })

  it('왼쪽으로 걸친 창의 동쪽 변을 당겨도 타이틀바가 남는다', () => {
    const hanging = { ...rect, x: -200 }
    const result = resizeRect(hanging, 'e', { x: -500, y: 0 }, { ...options, area, constraint })
    expect(result.x + result.width).toBe(64)
  })

  it('오른쪽으로 걸친 창의 서쪽 변을 밀어도 타이틀바가 남는다', () => {
    const hanging = { ...rect, x: 900 }
    const result = resizeRect(hanging, 'w', { x: 500, y: 0 }, { ...options, area, constraint })
    expect(area.width - result.x).toBe(64)
  })
})
