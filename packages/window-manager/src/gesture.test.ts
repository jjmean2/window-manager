import { describe, expect, it, vi } from 'vitest'
import { createPointerSession, type PointerSample } from './gesture.ts'

function setup(threshold = 3) {
  const onStart = vi.fn()
  const onMove = vi.fn()
  const onEnd = vi.fn()
  const session = createPointerSession({
    pointerId: 1,
    startX: 100,
    startY: 100,
    threshold,
    onStart,
    onMove,
    onEnd,
  })
  return { session, onStart, onMove, onEnd }
}

const at = (clientX: number, clientY: number, extra: Partial<PointerSample> = {}): PointerSample => ({
  pointerId: 1,
  clientX,
  clientY,
  buttons: 1,
  ...extra,
})

describe('createPointerSession', () => {
  it('임계값을 넘기 전에는 시작하지 않는다', () => {
    const { session, onStart, onMove } = setup()
    session.move(at(101, 101))
    expect(onStart).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('임계값을 넘으면 시작하고, 누른 지점부터의 이동량을 알린다', () => {
    const { session, onStart, onMove } = setup()
    session.move(at(110, 100))
    session.move(at(130, 90))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenLastCalledWith({ x: 30, y: -10 }, at(130, 90))
  })

  it('임계값이 0 이면 첫 이동에서 시작한다', () => {
    const { session, onStart } = setup(0)
    session.move(at(100, 100))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('버튼을 놓으면 적용하며 끝난다', () => {
    const { session, onEnd } = setup()
    session.move(at(110, 100))
    session.up(at(110, 100, { buttons: 0 }))
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: true, commit: true })
  })

  it('capture 를 잃은 뒤에 온 이동과 놓기도 그대로 처리한다', () => {
    // capture 상실은 세션에 전달되지 않는다. 그 뒤의 이벤트가 평소대로 오는 것만 중요하다.
    const { session, onMove, onEnd } = setup()
    session.move(at(20, 100))
    session.move(at(0, 100))
    expect(onMove).toHaveBeenCalledTimes(2)
    session.up(at(1, 101, { buttons: 0 }))
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: true, commit: true })
  })

  it('브라우저가 취소하면 적용하지 않고 끝난다', () => {
    const { session, onEnd } = setup()
    session.move(at(110, 100))
    session.cancel(at(110, 100))
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: true, commit: false })
  })

  it('버튼이 떼어진 이동을 만나면 놓은 것으로 보고 끝낸다', () => {
    const { session, onMove, onEnd } = setup()
    session.move(at(110, 100))
    session.move(at(300, 300, { buttons: 0 }))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: true, commit: true })
  })

  it('다른 포인터의 이벤트는 무시한다', () => {
    const { session, onStart, onEnd } = setup()
    session.move(at(200, 200, { pointerId: 2 }))
    session.up(at(200, 200, { pointerId: 2, buttons: 0 }))
    session.cancel(at(200, 200, { pointerId: 2 }))
    expect(onStart).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('시작되지 않은 채 끝나도 끝났음을 알린다', () => {
    const { session, onEnd } = setup()
    session.up(at(100, 100, { buttons: 0 }))
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: false, commit: true })
  })

  it('끝난 뒤의 이벤트는 무시하고, 끝났음은 한 번만 알린다', () => {
    const { session, onMove, onEnd } = setup()
    session.move(at(110, 100))
    session.up(at(110, 100, { buttons: 0 }))
    session.move(at(200, 200))
    session.cancel(at(200, 200))
    session.abort()
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('abort 는 포인터와 무관하게 적용하지 않고 끝낸다', () => {
    const { session, onEnd } = setup()
    session.move(at(110, 100))
    session.abort()
    expect(onEnd).toHaveBeenCalledExactlyOnceWith({ started: true, commit: false })
  })
})
