const handledBy = new WeakMap<Event, Set<object>>()

/**
 * 어느 관리자의 창 안에서(창이 연 팝업 포함) 일어난 누름인지 표시한다.
 * 관리자별로 기록하므로, 한 관리자의 창을 누르면 다른 관리자에게는 바깥 누름이 된다.
 */
export function markHandledByWindow(event: Event, manager: object) {
  const managers = handledBy.get(event)
  if (managers) managers.add(manager)
  else handledBy.set(event, new Set([manager]))
}

export function wasHandledByWindow(event: Event, manager: object): boolean {
  return handledBy.get(event)?.has(manager) ?? false
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
