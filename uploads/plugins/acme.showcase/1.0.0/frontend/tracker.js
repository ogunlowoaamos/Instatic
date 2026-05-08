// examples/plugins/showcase/frontend/tracker.ts
(function init() {
  const pb = window.__pb;
  if (!pb || !pb.tracker) {
    console.warn("[acme.showcase] page runtime not available");
    return;
  }
  const counts = new Map;
  function bumpCounter(eventName) {
    const next = (counts.get(eventName) || 0) + 1;
    counts.set(eventName, next);
    document.querySelectorAll(`[data-pb-counter="${CSS.escape(eventName)}"] [data-pb-counter-value]`).forEach((el) => {
      el.textContent = String(next);
    });
  }
  pb.hooks.on("page-view", (detail) => {
    bumpCounter("page-view");
    pb.tracker.sendFor("acme.showcase", "page-view", detail);
  });
  pb.hooks.on("link-click", (detail) => {
    bumpCounter("link-click");
    pb.tracker.sendFor("acme.showcase", "link-click", detail);
  });
  pb.hooks.on("scroll-depth", (detail) => {
    bumpCounter("scroll-depth");
    pb.tracker.sendFor("acme.showcase", "scroll-depth", detail);
  });
})();
