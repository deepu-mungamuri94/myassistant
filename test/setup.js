/**
 * Vitest setup file
 * Runs before all tests to prepare the jsdom environment
 */

// Polyfill window.crypto with Node's webcrypto
// jsdom doesn't provide crypto.subtle, but Node 22 does
const { webcrypto } = require('node:crypto');

// Use Object.defineProperty because window.crypto is read-only in jsdom
Object.defineProperty(window, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
});

// Also set globalThis.crypto for good measure
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
});

// Mark that Capacitor is not available (we're running in Node)
window.Capacitor = undefined;

// Initialize a minimal window.DB object so modules can read from it
window.DB = {
  income: {},
  salaries: [],
  expenses: [],
  loans: [],
  cards: [],
  credentials: [],
  settings: {},
};

// jsdom already provides btoa/atob, but ensure they're on window
if (typeof window.btoa === 'undefined') {
  window.btoa = globalThis.btoa;
}
if (typeof window.atob === 'undefined') {
  window.atob = globalThis.atob;
}
