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

describe('최대화와 스냅', () => {
  it('최대화해도 일반 상태의 자리는 남고, 실제 자리는 영역을 채운다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    store.maximize('a')
    expect(store.getState().layout.windows.a).toEqual({
      rect: { x: 100, y: 100, ...size },
      placement: 'maximized',
    })
    expect(store.getEffectiveRect('a')).toEqual({ x: 0, y: 0, width: 1000, height: 800 })
  })

  it('영역 크기가 바뀌면 최대화·스냅된 창이 따라간다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.maximize('a')
    store.snap('b', 'right')
    store.setAreaSize({ width: 600, height: 400 })
    expect(store.getEffectiveRect('a')).toEqual({ x: 0, y: 0, width: 600, height: 400 })
    expect(store.getEffectiveRect('b')).toEqual({ x: 300, y: 0, width: 300, height: 400 })
  })

  it('toggleMaximize 와 restore 는 일반 상태의 자리로 되돌린다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    store.toggleMaximize('a')
    expect(store.getState().layout.windows.a!.placement).toBe('maximized')
    store.toggleMaximize('a')
    expect(store.getEffectiveRect('a')).toEqual({ x: 100, y: 100, ...size })
    store.snap('a', 'left')
    store.restore('a')
    expect(store.getEffectiveRect('a')).toEqual({ x: 100, y: 100, ...size })
  })

  it('최대화된 창은 리사이즈하지 않는다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    store.maximize('a')
    const before = store.getState().layout
    store.resizeFrom('a', store.getEffectiveRect('a')!, 'se', { x: -100, y: -100 })
    expect(store.getState().layout).toBe(before)
  })

  it('스냅된 창을 리사이즈하면 그 자리에서 일반 상태가 된다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    store.snap('a', 'left')
    store.resizeFrom('a', store.getEffectiveRect('a')!, 'e', { x: -100, y: 0 })
    expect(store.getState().layout.windows.a).toEqual({
      rect: { x: 0, y: 0, width: 400, height: 800 },
      placement: 'normal',
    })
  })

  it('최대화된 창을 끌면 일반 크기로 풀려 포인터 아래에 놓인다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    store.maximize('a')
    const start = store.detach('a', { x: 500, y: 16 })
    expect(start).toEqual({ x: 350, y: 0, ...size })
    expect(store.getState().layout.windows.a).toEqual({ rect: start, placement: 'normal' })
  })

  it('일반 상태의 창은 detach 해도 그대로다', () => {
    const store = setup()
    store.register('a', { ...size, x: 100, y: 100 })
    const before = store.getState().layout
    expect(store.detach('a', { x: 150, y: 110 })).toEqual({ x: 100, y: 100, ...size })
    expect(store.getState().layout).toBe(before)
  })
})

describe('최소화', () => {
  it('활성 창은 그다음 앞에 있는 보이는 창으로 넘어간다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.register('c', size)
    store.minimize('b')
    store.minimize('c')
    expect(store.getState().activeId).toBe('a')
    expect(store.getState().layout.order).toEqual(['a', 'b', 'c'])
  })

  it('보이는 창이 없으면 활성 창이 없다', () => {
    const store = setup()
    store.register('a', size)
    store.minimize('a')
    expect(store.getState().activeId).toBeNull()
  })

  it('복원하면 최소화 전의 배치로 돌아오고 맨 앞에서 활성화된다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.maximize('a')
    store.minimize('a')
    expect(store.getState().layout.windows.a).toMatchObject({
      placement: 'minimized',
      restorePlacement: 'maximized',
    })
    store.restore('a')
    expect(store.getState().layout.windows.a!.placement).toBe('maximized')
    expect(store.getState().layout.windows.a!.restorePlacement).toBeUndefined()
    expect(store.getState().layout.order).toEqual(['b', 'a'])
    expect(store.getState().activeId).toBe('a')
  })

  it('activate 도 최소화된 창을 되돌린다', () => {
    const store = setup()
    store.register('a', size)
    store.snap('a', 'left')
    store.minimize('a')
    store.activate('a')
    expect(store.getState().layout.windows.a!.placement).toEqual({ snap: 'left' })
  })

  it('활성 창을 닫을 때 최소화된 창으로는 넘어가지 않는다', async () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.register('c', size)
    store.minimize('b')
    store.activate('c')
    store.unregister('c')
    await flush()
    expect(store.getState().activeId).toBe('a')
  })

  it('최소화된 채 닫힌 창을 다시 열면 보이는 상태로 열린다', async () => {
    const store = setup()
    store.register('a', size)
    store.maximize('a')
    store.minimize('a')
    store.unregister('a')
    await flush()
    store.register('a', size)
    expect(store.getState().layout.windows.a!.placement).toBe('maximized')
    expect(store.getState().activeId).toBe('a')
  })
})

describe('끌어서 스냅', () => {
  function snapSetup() {
    const store = createWindowManagerStore(undefined, { snap: true })
    store.setAreaSize({ width: 1000, height: 800 })
    store.register('a', { ...size, x: 100, y: 100 })
    return store
  }

  it('스냅이 꺼져 있으면 미리보기가 생기지 않는다', () => {
    const store = setup()
    store.register('a', size)
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 0, y: 400 })
    expect(store.getState().snapPreview).toBeNull()
  })

  it('가장자리에 닿으면 미리보기가 생기고, 떨어지면 사라진다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 2, y: 400 })
    expect(store.getState().snapPreview).toBe('left')
    store.previewSnap({ x: 300, y: 400 })
    expect(store.getState().snapPreview).toBeNull()
  })

  it('놓을 때에만 적용한다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 998, y: 400 })
    expect(store.getState().layout.windows.a!.placement).toBe('normal')
    store.endGesture()
    expect(store.getState().layout.windows.a!.placement).toEqual({ snap: 'right' })
    expect(store.getState().snapPreview).toBeNull()
  })

  it('스냅을 풀면 끌려온 가장자리가 아니라 끌기 전의 자리로 돌아간다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.moveTo('a', { x: 900, y: 300 })
    store.previewSnap({ x: 998, y: 400 })
    store.endGesture()
    store.restore('a')
    expect(store.getState().layout.windows.a).toEqual({
      rect: { x: 100, y: 100, ...size },
      placement: 'normal',
    })
  })

  it('최대화에서 끌어내 다시 스냅해도 원래 자리를 기억한다', () => {
    const store = snapSetup()
    store.maximize('a')
    store.beginGesture('a', 'move')
    const start = store.detach('a', { x: 500, y: 16 })!
    store.moveTo('a', { x: start.x - 400, y: start.y + 200 })
    store.previewSnap({ x: 2, y: 216 })
    store.endGesture()
    expect(store.getState().layout.windows.a).toEqual({
      rect: { x: 100, y: 100, ...size },
      placement: { snap: 'left' },
    })
  })

  it('스냅하지 않고 놓으면 옮긴 자리에 남는다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.moveTo('a', { x: 400, y: 300 })
    store.previewSnap({ x: 500, y: 320 })
    store.endGesture()
    expect(store.getState().layout.windows.a!.rect).toMatchObject({ x: 400, y: 300 })
  })

  it('위쪽 가장자리에서 놓으면 최대화된다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 500, y: 0 })
    store.endGesture()
    expect(store.getState().layout.windows.a!.placement).toBe('maximized')
  })

  it('취소된 제스처는 미리보기만 지운다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 2, y: 400 })
    store.endGesture({ commit: false })
    expect(store.getState().layout.windows.a!.placement).toBe('normal')
    expect(store.getState().snapPreview).toBeNull()
  })

  it('끄는 도중에 창이 닫히면 미리보기를 지운다', async () => {
    const store = snapSetup()
    store.beginGesture('a', 'move')
    store.previewSnap({ x: 2, y: 400 })
    store.unregister('a')
    await flush()
    expect(store.getState().snapPreview).toBeNull()
    expect(store.getState().gesture).toBeNull()
  })

  it('리사이즈 중에는 스냅하지 않는다', () => {
    const store = snapSetup()
    store.beginGesture('a', 'resize')
    store.previewSnap({ x: 2, y: 400 })
    expect(store.getState().snapPreview).toBeNull()
  })
})

describe('getWindowList', () => {
  it('연 순서대로 돌려주고, 활성화해도 순서가 바뀌지 않는다', () => {
    const store = setup()
    store.register('a', size)
    store.register('b', size)
    store.activate('a')
    expect(store.getWindowList()).toEqual([
      { id: 'a', placement: 'normal', active: true },
      { id: 'b', placement: 'normal', active: false },
    ])
  })

  it('창을 옮기는 동안에는 같은 배열을 돌려준다', () => {
    const store = setup()
    store.register('a', size)
    const before = store.getWindowList()
    store.moveTo('a', { x: 300, y: 300 })
    expect(store.getWindowList()).toBe(before)
    store.minimize('a')
    expect(store.getWindowList()).not.toBe(before)
    expect(store.getWindowList()[0]).toMatchObject({ placement: 'minimized', active: false })
  })

  it('저장된 배치로 시작한 창도 열리면 목록에 나온다', () => {
    const store = setup({
      windows: { a: { rect: { x: 1, y: 2, ...size }, placement: 'normal' } },
      order: ['a'],
    })
    expect(store.getWindowList()).toEqual([])
    store.register('a', size)
    expect(store.getWindowList()).toEqual([{ id: 'a', placement: 'normal', active: false }])
  })
})
