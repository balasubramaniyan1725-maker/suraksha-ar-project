// offline.js — module caching (so AR training works with no signal at a
// mine/plant site) and a sync queue for progress/step calls made while
// offline. Uses localStorage (simple, reliable across mid-range Android
// browsers) rather than IndexedDB, which is plenty for this dataset size.

const OFFLINE = {
  MODULES_KEY: "suraksha_cache_modules",
  MODULE_DETAIL_PREFIX: "suraksha_cache_module_",
  QUEUE_KEY: "suraksha_sync_queue",

  isOnline() { return navigator.onLine; },

  async cacheAllModules() {
    const list = await API.listModules();
    localStorage.setItem(this.MODULES_KEY, JSON.stringify(list.modules));
    for (const m of list.modules) {
      try {
        const detail = await API.getModule(m.code);
        localStorage.setItem(this.MODULE_DETAIL_PREFIX + m.code, JSON.stringify(detail.module));
      } catch (e) { /* needs auth; caller may retry after login */ }
    }
    localStorage.setItem("suraksha_cache_time", String(Date.now()));
    return list.modules.length;
  },

  getCachedModuleList() {
    const raw = localStorage.getItem(this.MODULES_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  getCachedModule(code) {
    const raw = localStorage.getItem(this.MODULE_DETAIL_PREFIX + code);
    return raw ? JSON.parse(raw) : null;
  },

  cacheTime() {
    const t = localStorage.getItem("suraksha_cache_time");
    return t ? new Date(parseInt(t, 10)) : null;
  },

  // ---- sync queue for step completions made offline ----
  queue() {
    const raw = localStorage.getItem(this.QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  enqueue(item) {
    const q = this.queue();
    q.push({ ...item, ts: Date.now() });
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(q));
  },
  async flush() {
    if (!this.isOnline()) return { synced: 0, remaining: this.queue().length };
    let q = this.queue();
    const remaining = [];
    let synced = 0;
    for (const item of q) {
      try {
        if (item.type === "step") {
          await API.completeStep(item.code, item.stepId);
          synced++;
        }
      } catch (e) {
        remaining.push(item);
      }
    }
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(remaining));
    return { synced, remaining: remaining.length };
  },
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

window.addEventListener("online", () => {
  document.getElementById("offline-banner")?.classList.add("hidden");
  OFFLINE.flush();
});
window.addEventListener("offline", () => {
  document.getElementById("offline-banner")?.classList.remove("hidden");
});
