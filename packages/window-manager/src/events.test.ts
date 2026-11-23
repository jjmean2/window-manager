import { describe, expect, it } from 'vitest'
import { markHandledByWindow, wasHandledByWindow } from './events.ts'

describe('관리자별 누름 표시', () => {
  it('표시한 관리자에게만 창 안의 누름이다', () => {
    const viewportManager = {}
    const areaManager = {}
    const event = new Event('pointerdown')
    markHandledByWindow(event, areaManager)
    expect(wasHandledByWindow(event, areaManager)).toBe(true)
    expect(wasHandledByWindow(event, viewportManager)).toBe(false)
  })

  it('표시되지 않은 누름은 모든 관리자에게 바깥 누름이다', () => {
    expect(wasHandledByWindow(new Event('pointerdown'), {})).toBe(false)
  })

  it('한 누름을 여러 관리자가 표시할 수 있다', () => {
    const a = {}
    const b = {}
    const event = new Event('pointerdown')
    markHandledByWindow(event, a)
    markHandledByWindow(event, b)
    expect(wasHandledByWindow(event, a)).toBe(true)
    expect(wasHandledByWindow(event, b)).toBe(true)
  })
})
