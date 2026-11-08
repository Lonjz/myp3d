import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { backend, server } from './fakeBackend';
import { resetFactories } from './factories';
import { emitAppEvent } from '../src/utils/appEvents';

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.assign(globalThis, { ResizeObserver: StubObserver, IntersectionObserver: StubObserver });

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;
HTMLMediaElement.prototype.play = function play() {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = () => undefined;
HTMLMediaElement.prototype.load = () => undefined;
URL.createObjectURL = () => 'blob:fake';
URL.revokeObjectURL = () => undefined;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  window.localStorage.clear();
  resetFactories();
  emitAppEvent('library-changed');
});

afterEach(() => {
  cleanup();
  const unhandled = backend.takeUnhandled();
  backend.reset();
  vi.useRealTimers();
  expect(unhandled, 'Requests the fake backend does not handle').toEqual([]);
});

afterAll(() => server.close());
