import '@testing-library/jest-dom'

// jsdom doesn't implement scrolling at all. Guarded since this setup file
// also runs for @jest-environment node test files, where Element doesn't exist.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollTo = jest.fn()
}
