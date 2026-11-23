import type { Point } from './geometry.ts'

/** PointerEvent 에서 제스처 판정에 쓰는 값만 뽑은 것 */
export interface PointerSample {
  pointerId: number
  clientX: number
  clientY: number
  /** 눌려 있는 버튼의 비트마스크. 0 이면 아무 버튼도 눌려 있지 않다 */
  buttons: number
}

export interface PointerSessionOptions {
  pointerId: number
  startX: number
  startY: number
  /** 이만큼 움직인 뒤에야 시작한다. 0 이면 첫 이동에서 시작한다 */
  threshold: number
  /** 임계값을 넘어 제스처가 시작될 때 한 번 */
  onStart: () => void
  /** 누른 지점부터의 이동량. 시작된 뒤에만 불린다 */
  onMove: (delta: Point, sample: PointerSample) => void
  /** 세션이 끝날 때 정확히 한 번. 시작되지 않은 채 끝나도 불린다 */
  onEnd: (result: { started: boolean; commit: boolean }) => void
}

export interface PointerSession {
  move: (sample: PointerSample) => void
  /** 버튼을 놓았다. 결과를 적용하며 끝낸다 */
  up: (sample: PointerSample) => void
  /** 브라우저가 포인터를 취소했다. 적용하지 않고 끝낸다 */
  cancel: (sample: PointerSample) => void
  /** 포인터와 무관하게 적용하지 않고 끝낸다 (손잡이가 사라진 경우 등) */
  abort: () => void
}

/**
 * 누름 하나에서 시작된 이동·리사이즈 제스처의 수명.
 *
 * 끝나는 조건은 셋뿐이다: 버튼을 놓음(`up`), 브라우저의 취소(`cancel`), 그리고 버튼이 떼어진
 * 채로 온 이동. pointer capture 를 잃는 것은 끝나는 조건이 아니다. capture 는 놓기 전에도
 * 풀릴 수 있고(브라우저나 OS 가 푼다), 그때 끝내 버리면 미리보기가 떠 있던 스냅이 버려진다.
 */
export function createPointerSession(options: PointerSessionOptions): PointerSession {
  const { pointerId, startX, startY, threshold, onStart, onMove, onEnd } = options
  let started = false
  let ended = false

  function end(commit: boolean) {
    if (ended) return
    ended = true
    onEnd({ started, commit })
  }

  return {
    move(sample) {
      if (ended || sample.pointerId !== pointerId) return
      // pointerup 을 받지 못한 채 버튼이 떼어졌다(창 밖에서 놓은 경우 등). 놓은 것으로 본다.
      if (sample.buttons === 0) {
        end(true)
        return
      }
      const delta = { x: sample.clientX - startX, y: sample.clientY - startY }
      if (!started) {
        if (Math.hypot(delta.x, delta.y) < threshold) return
        started = true
        onStart()
      }
      onMove(delta, sample)
    },
    up(sample) {
      if (sample.pointerId === pointerId) end(true)
    },
    cancel(sample) {
      if (sample.pointerId === pointerId) end(false)
    },
    abort() {
      end(false)
    },
  }
}
