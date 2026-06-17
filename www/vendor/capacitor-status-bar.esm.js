// Vendored @capacitor/status-bar (self-contained for offline use).
// Combines dist/esm/index.js + dist/esm/definitions.js so there are no
// sibling-file imports at runtime. `@capacitor/core` resolves via the
// import map in index.html to ./vendor/capacitor-core.esm.js.
import { registerPlugin } from '@capacitor/core';

export var Style;
(function (Style) {
    Style["Dark"] = "DARK";
    Style["Light"] = "LIGHT";
    Style["Default"] = "DEFAULT";
})(Style || (Style = {}));

export var Animation;
(function (Animation) {
    Animation["None"] = "NONE";
    Animation["Slide"] = "SLIDE";
    Animation["Fade"] = "FADE";
})(Animation || (Animation = {}));

/** @deprecated Use `Animation`. */
export const StatusBarAnimation = Animation;
/** @deprecated Use `Style`. */
export const StatusBarStyle = Style;

const StatusBar = registerPlugin('StatusBar');
export { StatusBar };
