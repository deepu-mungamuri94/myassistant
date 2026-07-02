/**
 * Helper to load vanilla-JS modules into the jsdom environment.
 *
 * These files are plain scripts (no module.exports), so we use require()
 * which treats them as CommonJS. Each file ends with `window.X = X`, so
 * after loading, we read the global from window.
 */

const path = require('path');

/**
 * Load a module from www/js/
 * @param {string} relativePathFromWww - e.g. "modules/loans.js"
 * @param {string} globalName - e.g. "Loans"
 * @returns {*} - The exported global (window[globalName])
 */
function loadModule(relativePathFromWww, globalName) {
  const absolutePath = path.resolve(__dirname, '../../www/js', relativePathFromWww);

  // Bust require cache to force fresh execution
  const resolvedPath = require.resolve(absolutePath);
  delete require.cache[resolvedPath];

  // Clear any existing global before loading
  delete window[globalName];

  // Load the file (side effect: runs `window.X = X`)
  require(absolutePath);

  // Check that the global was set (catches null and undefined)
  if (window[globalName] == null) {
    throw new Error(
      `Module loaded from ${relativePathFromWww} but window.${globalName} is ${window[globalName]}. ` +
      `Check that the file exports to window.${globalName}.`
    );
  }

  return window[globalName];
}

module.exports = { loadModule };
