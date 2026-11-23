import { describe, expect, it, vi } from 'vitest'
import { createWindowManagerStore, type WindowLayout } from './store.ts'

const size = { width: 300, height: 200 }
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

function setup(layout?: WindowLayout) {
  const store = createWindowManagerStore(layout)
  store.setAreaSize({ width: 1000, height: 800 })
  return store
}

describe('register / unregister', () => {
  it('새로 열린 창은 맨 앞에 오고 활성 창이 된다', () => {
    const store = setup()
    store.register('a', { ...size, x: 10, y: 10 })
    store.register('b', { ...size, x: 20, y: 20 })
    expect(store.getState().layout.order).toEqual(['a', 'b'])
    expect(store.getState().activeId).toBe('b')
  })

  it('위치를 생략하면 계단식으로 놓는다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    const { a, b } = store.getState().layout.windows
    expect(b!.rect.x).toBeGreaterThan(a!.rect.x)
    expect(b!.rect.y).toBeGreaterThan(a!.rect.y)
  })

  it('저장된 배치의 자리와 순서를 유지한다', () => {
    const saved: WindowLayout = {
      windows: {
        a: { rect: { x: 1, y: 2, ...size }, placement: 'normal' },
        b: { rect: { x: 3, y: 4, ...size }, placement: 'normal' },
      },
      order: ['b', 'a'],
    }
    const store = setup(saved)
    store.register('a', { ...size, x: 500, y: 500 })
    store.register('b', { ...size, x: 500, y: 500 })
    expect(store.getState().layout.order).toEqual(['b', 'a'])
    expect(store.getState().layout.windows.a!.rect).toEqual({ x: 1, y: 2, ...size })
  })

  it('StrictMode 의 mount → unmount → mount 에서 순서를 잃지 않는다', async () => {
    const saved: WindowLayout = {
      windows: {
        a: { rect: { x: 1, y: 2, ...size }, placement: 'normal' },
        b: { rect: { x: 3, y: 4, ...size }, placement: 'normal' },
      },
      order: ['b', 'a'],
    }
    const store = setup(saved)
    for (const id of ['a', 'b']) {
      store.register(id, size)
      store.unregister(id)
      store.register(id, size)
    }
    await flush()
    expect(store.getState().layout.order).toEqual(['b', 'a'])
  })

  it('닫으면 순서에서 빠지고 자리는 남는다. 다시 열면 같은 자리에서 맨 앞으로 온다', async () => {
    const store = setup()
    store.register('a', { ...size, x: 10, y: 10 })
    store.register('b', { ...size, x: 20, y: 20 })
    store.moveTo('a', { x: 111, y: 222 })
    store.unregister('a')
    await flush()
    expect(store.getState().layout.order).toEqual(['b'])
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 111, y: 222 })

    store.register('a', { ...size, x: 10, y: 10 })
    expect(store.getState().layout.order).toEqual(['b', 'a'])
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 111, y: 222 })
    expect(store.getState().activeId).toBe('a')
  })

  it('활성 창을 닫으면 그다음 앞에 있는 창이 활성 창이 된다', async () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.register('c', size)
    store.unregister('c')
    await flush()
    expect(store.getState().activeId).toBe('b')
  })
})

describe('activate', () => {
  it('창을 맨 앞으로 가져온다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.register('c', size)
    store.activate('a')
    expect(store.getState().layout.order).toEqual(['b', 'c', 'a'])
    expect(store.getState().activeId).toBe('a')
  })

  it('다른 창의 상태 객체는 바꾸지 않는다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    const before = store.getState().layout.windows.b
    store.activate('a')
    store.moveTo('a', { x: 400, y: 300 })
    expect(store.getState().layout.windows.b).toBe(before)
  })

  it('deactivate 는 순서를 건드리지 않는다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.deactivate()
    expect(store.getState().activeId).toBeNull()
    expect(store.getState().layout.order).toEqual(['a', 'b'])
  })
})

describe('이동 제약', () => {
  it('moveTo 는 타이틀바가 닿는 위치로 제한한다', () => {
    const store = setup()
    store.register('a', { ...size, x: 10, y: 10 })
    store.moveTo('a', { x: -5000, y: -5000 })
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 64 - 300, y: 0 })
    store.moveTo('a', { x: 5000, y: 5000 })
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 1000 - 64, y: 800 - 32 })
  })

  it('영역이 줄어들면 창을 다시 끌어들인다', () => {
    const store = setup()
    store.register('a', { ...size, x: 900, y: 700 })
    store.setAreaSize({ width: 500, height: 400 })
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 500 - 64, y: 400 - 32 })
  })

  it('영역 크기를 알기 전에 등록된 창도 영역이 정해지면 제약을 받는다', () => {
    const store = createWindowManagerStore()
    store.register('a', { ...size, x: 5000, y: 5000 })
    store.setAreaSize({ width: 1000, height: 800 })
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 1000 - 64, y: 800 - 32 })
  })

  it('resizeFrom 은 창별 최소 크기를 지킨다', () => {
    const store = setup()
    store.setMeta('a', { minSize: { width: 250, height: 150 } })
    store.register('a', { ...size, x: 100, y: 100 })
    const start = store.getState().layout.windows.a!.rect
    store.resizeFrom('a', start, 'nw', { x: 999, y: 999 })
    expect(store.getState().layout.windows.a!.rect).toEqual({
      x: 150,
      y: 150,
      width: 250,
      height: 150,
    })
  })
})

describe('onLayoutChange', () => {
  it('제스처 도중에는 알리지 않고 끝났을 때 한 번 알린다', async () => {
    const store = setup()
    store.register('a', { ...size, x: 10, y: 10 })
    await flush()
    const listener = vi.fn()
    store.setLayoutListener(listener)

    store.beginGesture('a', 'move')
    store.moveTo('a', { x: 50, y: 50 })
    store.moveTo('a', { x: 60, y: 60 })
    await flush()
    expect(listener).not.toHaveBeenCalled()

    store.endGesture()
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]![0].windows.a.rect).toMatchObject({ x: 60, y: 60 })
  })

  it('리스너가 붙기 전의 창 등록은 알리지 않는다 (알림보다 리스너가 먼저 붙는 경우)', async () => {
    const store = setup()
    const listener = vi.fn()
    store.register('a', size)
    store.setLayoutListener(listener)
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it('리스너가 붙기 전의 창 등록은 알리지 않는다 (알림이 먼저 지나간 경우)', async () => {
    const store = setup()
    const listener = vi.fn()
    store.register('a', size)
    await flush()
    store.setLayoutListener(listener)
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it('리스너가 붙은 뒤에 열린 창은 알린다', async () => {
    const store = setup()
    const listener = vi.fn()
    store.setLayoutListener(listener)
    store.register('a', size)
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('제스처 도중에 창이 닫혀도 이후 변화를 계속 알린다', async () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    await flush()
    const listener = vi.fn()
    store.setLayoutListener(listener)

    store.beginGesture('a', 'move')
    store.moveTo('a', { x: 80, y: 80 })
    store.unregister('a')
    await flush()
    expect(store.getState().gesture).toBeNull()

    listener.mockClear()
    store.moveTo('b', { x: 90, y: 90 })
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('순서가 바뀌면 알린다', async () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    await flush()
    const listener = vi.fn()
    store.setLayoutListener(listener)
    store.activate('a')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]![0].order).toEqual(['b', 'a'])
  })

  it('활성 창만 바뀌면 알리지 않는다', async () => {
    const store = setup()
    store.register('a', size)
    await flush()
    const listener = vi.fn()
    store.setLayoutListener(listener)
    store.deactivate()
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('setLayout', () => {
  it('열려 있는 창만 순서에 남기고, 새 배치에 없는 열린 창은 자리를 유지한다', () => {
    const store = setup()
    store.register('a', { ...size, x: 10, y: 10 })
    store.register('b', { ...size, x: 20, y: 20 })
    store.setLayout({
      windows: {
        a: { rect: { x: 300, y: 300, ...size }, placement: 'normal' },
        closed: { rect: { x: 0, y: 0, ...size }, placement: 'normal' },
      },
      order: ['closed', 'a'],
    })
    const { layout } = store.getState()
    expect(layout.order).toEqual(['a', 'b'])
    expect(layout.windows.a!.rect).toMatchObject({ x: 300, y: 300 })
    expect(layout.windows.b!.rect).toMatchObject({ x: 20, y: 20 })
  })
})
