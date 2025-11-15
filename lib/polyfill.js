// Lightweight alias so code can reference `browser` like in Firefox.
(function () {
  if (typeof self !== "undefined" && !self.browser && typeof self.chrome !== "undefined") {
    try {
      self.browser = self.chrome;
    } catch {
      // noop
    }
  }
})();
