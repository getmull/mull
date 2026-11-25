import { act, renderHook } from '@testing-library/react'
import { useReadingProgress } from './useReadingProgress'

beforeEach(() => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue({ ok: true })
})
afterEach(() => jest.useRealTimers())
const tick = async () => { await act(async () => { jest.advanceTimersByTime(1000) }) }

test('does not write on mount, and debounces navigation', async () => {
  const { rerender } = renderHook(({ page }) => useReadingProgress('doc', page, 10, 1), { initialProps: { page: 1 } })
  await tick()
  expect(fetch).not.toHaveBeenCalled()
  rerender({ page: 2 })
  rerender({ page: 3 })
  await tick()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith('/api/documents/doc', expect.objectContaining({ body: JSON.stringify({ last_page: 3, progress_pct: 30 }) }))
})

test('serializes slow requests and writes the latest page after the pending save', async () => {
  let resolve!: (response: unknown) => void
  ;(fetch as jest.Mock).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const { rerender, result } = renderHook(({ page }) => useReadingProgress('doc', page, 10, 1), { initialProps: { page: 1 } })
  rerender({ page: 2 })
  await tick()
  rerender({ page: 3 })
  await tick()
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { resolve({ ok: true }) })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).last_page).toBe(3)
  expect(result.current.status).toBe('saved')
})

test('allows retry after a rejected HTTP response', async () => {
  ;(fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
  const { rerender, result } = renderHook(({ page }) => useReadingProgress('doc', page, 10, 1), { initialProps: { page: 1 } })
  rerender({ page: 2 })
  await tick()
  expect(result.current.status).toBe('error')
  await act(async () => { await result.current.retry() })
  expect(result.current.status).toBe('saved')
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('flushes a pending page when leaving before the debounce fires', () => {
  const { rerender, unmount } = renderHook(({ page }) => useReadingProgress('doc', page, 10, 1), { initialProps: { page: 1 } })
  rerender({ page: 4 })
  unmount()
  expect(fetch).toHaveBeenCalledWith('/api/documents/doc', expect.objectContaining({ keepalive: true, body: JSON.stringify({ last_page: 4, progress_pct: 40 }) }))
})

test('flushes on pagehide and does not send a second write for the same page', async () => {
  const { rerender } = renderHook(({ page }) => useReadingProgress('doc', page, 10, 1), { initialProps: { page: 1 } })
  rerender({ page: 2 })
  await act(async () => { window.dispatchEvent(new Event('pagehide')) })
  await tick()
  expect(fetch).toHaveBeenCalledTimes(1)
})
