import type { Locator } from '@playwright/test'

/** Select real DOM text so the browser fires the same selection events as touch/drag. */
export async function selectReflowText(paragraph: Locator, quote: string) {
  await paragraph.scrollIntoViewIfNeeded()
  await paragraph.evaluate((element, selected) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const start = node.textContent!.indexOf(selected)
      if (start < 0) continue
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + selected.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      return
    }
    throw new Error('Requested passage was not present in the reflow text')
  }, quote)
}
