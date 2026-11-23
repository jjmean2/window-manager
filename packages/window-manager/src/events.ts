const handledByWindow = new WeakSet<Event>()

/** 창 안에서(창이 연 팝업 포함) 일어난 누름임을 표시한다. */
export function markHandledByWindow(event: Event) {
  handledByWindow.add(event)
}

export function wasHandledByWindow(event: Event): boolean {
  return handledByWindow.has(event)
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="menuitem"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-window-no-drag]',
].join(',')

/** 타이틀바 안에서 드래그를 시작하면 안 되는 요소인지 본다. */
export function isInteractiveTarget(target: Element, boundary: Element): boolean {
  const hit = target.closest(INTERACTIVE_SELECTOR)
  return hit !== null && boundary.contains(hit) && hit !== boundary
}
