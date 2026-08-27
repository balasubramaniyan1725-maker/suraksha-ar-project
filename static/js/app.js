// app.js — hash router + screens. Vanilla JS, no build step, so the whole
// product (frontend + backend) is one runnable project.

const app = document.getElementById("app");
const bottomNav = document.getElementById("bottom-nav");

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function isLoggedIn() { return !!API.token(); }

function requireAuthOrRedirect() {
  if (!isLoggedIn()) { location.hash = "#/login"; return false; }
  return true;
}

function langPill() {
  const langs = [["en", "EN"], ["hi", "\u0939\u093f"], ["sat", "\u1c67\u1c40\u1c56"]];
  return `<div class="lang-pill">${langs
    .map(([code, label]) => `<button data-lang="${code}" class="${currentLang() === code ? "active" : ""}">${label}</button>`)
    .join("")}</div>`;
}
function bindLangPill(root, rerender) {
  root.querySelectorAll("[data-lang]").forEach((b) => {
    b.onclick = () => { setLang(b.dataset.lang); rerender(); };
  });
}

// ---------------------------------------------------------------- router --
const routes = {};
function route(pattern, handler) { routes[pattern] = handler; }

function matchRoute(hash) {
  const path = hash.replace(/^#/, "") || "/";
  for (const pattern in routes) {
    const parts = pattern.split("/").filter(Boolean);
    const pieces = path.split("/").filter(Boolean);
    if (parts.length !== pieces.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(pieces[i]);
      else if (parts[i] !== pieces[i]) { ok = false; break; }
    }
    if (ok) return { handler: routes[pattern], params };
  }
  return null;
}

async function render() {
  const hash = location.hash || "#/";
  const m = matchRoute(hash);
  const showNav = isLoggedIn() && !hash.startsWith("#/ar/") && !hash.startsWith("#/login") && !hash.startsWith("#/register") && hash !== "#/";
  bottomNav.classList.toggle("hidden", !showNav);
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === hash);
  });
  if (!m) { app.innerHTML = `<div class="screen"><div class="card">Not found</div></div>`; return; }
  try {
    await m.handler(m.params);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="screen"><div class="error-box">${t("common.error")}: ${e.message || e}</div>
      <button class="btn secondary" onclick="location.hash='#/modules'">${t("common.back")}</button></div>`;
  }
}
window.addEventListener("hashchange", render);
document.querySelectorAll(".nav-btn").forEach((b) => {
  b.onclick = () => { location.hash = b.dataset.route; };
});

function loadingScreen() {
  app.innerHTML = `<div class="center-col"><div class="spinner"></div><p>${t("common.loading")}</p></div>`;
}

// ------------------------------------------------------------- HOME/LOGIN --
route("/", async () => {
  if (isLoggedIn()) { location.hash = "#/modules"; return; }
  app.innerHTML = `
    <div class="screen">
      <div class="brand"><div class="logo">\u26a0\ufe0f</div>
        <div><h1>${t("app.name")}</h1><small>${t("app.tagline")}</small></div>
      </div>
      ${langPill()}
      <div class="hero">
        <h2>${t("home.hero.title")}</h2>
        <p>${t("home.hero.body")}</p>
        <div class="hero-badges">
          <span class="badge">\ud83d\udcf6 ${t("home.badge.offline")}</span>
          <span class="badge">\ud83d\udc53 ${t("home.badge.nohead")}</span>
          <span class="badge">\ud83c\udd94 ${t("home.badge.qr")}</span>
        </div>
      </div>
      <button class="btn" id="go-register">${t("auth.register")}</button>
      <div style="height:10px;"></div>
      <button class="btn secondary" id="go-login">${t("auth.login")}</button>
      <div style="height:16px;"></div>
      <button class="btn outline" id="go-verify" style="font-size:13px;">${t("verify.title")}</button>
    </div>`;
  bindLangPill(app, render);
  document.getElementById("go-register").onclick = () => (location.hash = "#/register");
  document.getElementById("go-login").onclick = () => (location.hash = "#/login");
  document.getElementById("go-verify").onclick = () => {
    const code = prompt("Certificate code (e.g. SAR-XXXXXXXX):");
    if (code) location.hash = "#/verify/" + code.trim();
  };
});

route("/login", async () => {
  app.innerHTML = `
    <div class="screen">
      <div class="brand"><div class="logo">\u26a0\ufe0f</div><h1>${t("auth.login")}</h1></div>
      <div id="err"></div>
      <div class="field"><label>${t("auth.phone")}</label><input type="tel" id="phone" placeholder="9876543210" /></div>
      <div class="field"><label>${t("auth.password")}</label><input type="password" id="password" /></div>
      <button class="btn" id="submit">${t("auth.submit.login")}</button>
      <div style="height:14px;"></div>
      <button class="btn secondary" id="toreg">${t("auth.noaccount")}</button>
    </div>`;
  document.getElementById("toreg").onclick = () => (location.hash = "#/register");
  document.getElementById("submit").onclick = async () => {
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    try {
      const res = await API.login({ phone, password });
      localStorage.setItem("suraksha_token", res.token);
      localStorage.setItem("suraksha_worker", JSON.stringify(res.worker));
      setLang(res.worker.language || "hi");
      location.hash = "#/modules";
    } catch (e) {
      document.getElementById("err").innerHTML = `<div class="error-box">${e.message}</div>`;
    }
  };
});

route("/register", async () => {
  app.innerHTML = `
    <div class="screen">
      <div class="brand"><div class="logo">\u26a0\ufe0f</div><h1>${t("auth.register")}</h1></div>
      <div id="err"></div>
      <div class="field"><label>${t("auth.name")}</label><input type="text" id="name" /></div>
      <div class="field"><label>${t("auth.phone")}</label><input type="tel" id="phone" placeholder="9876543210" /></div>
      <div class="field"><label>${t("auth.password")}</label><input type="password" id="password" /></div>
      <div class="field"><label>${t("auth.sector")}</label>
        <select id="sector">
          <option value="mining">Mining</option>
          <option value="steel">Steel</option>
          <option value="mica">Mica</option>
        </select>
      </div>
      <div class="field"><label>${t("auth.site")}</label><input type="text" id="site" /></div>
      <div class="field"><label>${t("settings.language")}</label>
        <select id="language"><option value="hi">\u0939\u093f\u0928\u094d\u0926\u0940</option><option value="en">English</option><option value="sat">\u1c67\u1c40\u1c56\u1c5c\u1c5f</option></select>
      </div>
      <button class="btn" id="submit">${t("auth.submit.register")}</button>
      <div style="height:14px;"></div>
      <button class="btn secondary" id="tologin">${t("auth.haveaccount")}</button>
    </div>`;
  document.getElementById("tologin").onclick = () => (location.hash = "#/login");
  document.getElementById("submit").onclick = async () => {
    const payload = {
      name: document.getElementById("name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      password: document.getElementById("password").value,
      sector: document.getElementById("sector").value,
      site: document.getElementById("site").value.trim(),
      language: document.getElementById("language").value,
    };
    try {
      const res = await API.register(payload);
      localStorage.setItem("suraksha_token", res.token);
      localStorage.setItem("suraksha_worker", JSON.stringify(res.worker));
      setLang(payload.language);
      location.hash = "#/modules";
    } catch (e) {
      document.getElementById("err").innerHTML = `<div class="error-box">${e.message}</div>`;
    }
  };
});

// -------------------------------------------------------------- MODULES --
route("/modules", async () => {
  if (!requireAuthOrRedirect()) return;
  loadingScreen();
  let modules, progressMap = {}, offline = false;
  try {
    const list = await API.listModules();
    modules = list.modules;
    try {
      const prog = await API.myProgress();
      prog.progress.forEach((p) => (progressMap[p.module_code] = p));
    } catch (e) {}
  } catch (e) {
    if (e.offline || !OFFLINE.isOnline()) {
      modules = OFFLINE.getCachedModuleList() || [];
      offline = true;
    } else throw e;
  }
  const domainIcon = {
    fire: ["\ud83d\udd25", "fire"], gas: ["\u2622\ufe0f", "gas"], machinery: ["\u2699\ufe0f", "machinery"],
    electrical: ["\u26a1", "electrical"], mica_dust: ["\ud83c\udf2b\ufe0f", "mica_dust"],
  };
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div><h2>${t("modules.title")}</h2></div>
        ${langPill()}
      </div>
      <p style="color:var(--text-dim);font-size:13px;margin-top:-8px;">${t("modules.subtitle")}</p>
      ${offline ? `<div class="error-box">${t("common.offline")} \u2014 showing cached modules.</div>` : ""}
      <div id="list"></div>
    </div>`;
  bindLangPill(app, render);
  const list = document.getElementById("list");
  modules.forEach((m) => {
    const [icon, cls] = domainIcon[m.domain] || ["\ud83d\udee1\ufe0f", "fire"];
    const prog = progressMap[m.code];
    const certified = prog && prog.status === "certified";
    const card = document.createElement("div");
    card.className = "card module-card";
    card.innerHTML = `
      <div class="module-ic ${cls}">${icon}</div>
      <div class="module-body">
        <h3>${moduleField(m, "title")}</h3>
        <div class="tags">
          <span class="tag">${m.step_count} ${t("modules.steps")}</span>
          ${certified ? `<span class="tag" style="background:#123a1e;border-color:#245a34;color:#7fe3ab;">\u2705 ${t("modules.certified")}</span>` : ""}
        </div>
      </div>
      <div class="chev">\u203a</div>`;
    card.onclick = () => (location.hash = "#/module/" + m.code);
    list.appendChild(card);
  });
});

route("/module/:code", async ({ code }) => {
  if (!requireAuthOrRedirect()) return;
  loadingScreen();
  let mod, progress = null;
  try {
    const res = await API.getModule(code);
    mod = res.module;
    localStorage.setItem("suraksha_cache_module_" + code, JSON.stringify(mod));
  } catch (e) {
    mod = OFFLINE.getCachedModule(code);
    if (!mod) throw e;
  }
  try {
    const p = await API.myProgress();
    progress = p.progress.find((x) => x.module_code === code);
  } catch (e) {}

  const arDone = progress && ["ar_completed", "assessed", "certified"].includes(progress.status);
  const certified = progress && progress.status === "certified";

  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <button class="back">\u2190</button>
        <h2>${moduleField(mod, "title")}</h2>
      </div>
      <div class="card">
        <p class="muted">${mod.domain.toUpperCase()} \u00b7 ${mod.ar_scene.steps.length} ${t("modules.steps")} \u00b7 ${t("assess.score")} \u2265 ${mod.pass_score}%</p>
        <div class="progress-bar"><div style="width:${certified ? 100 : arDone ? 66 : 20}%"></div></div>
      </div>
      <button class="btn" id="start-ar">${arDone ? t("modules.continue") : t("modules.start")}</button>
      ${arDone ? `<div style="height:10px;"></div><button class="btn secondary" id="go-assess">${t("ar.go_assessment")}</button>` : ""}
      ${certified ? `<div style="height:10px;"></div><button class="btn outline" id="go-cert">${t("assess.view_cert")}</button>` : ""}
    </div>`;
  app.querySelector(".back").onclick = () => (location.hash = "#/modules");
  document.getElementById("start-ar").onclick = () => (location.hash = "#/ar/" + code);
  const goAssess = document.getElementById("go-assess");
  if (goAssess) goAssess.onclick = () => (location.hash = "#/assessment/" + code);
  const goCert = document.getElementById("go-cert");
  if (goCert) goCert.onclick = () => (location.hash = "#/certificates");
});

// -------------------------------------------------------------- AR SCREEN --
route("/ar/:code", async ({ code }) => {
  if (!requireAuthOrRedirect()) return;
  app.innerHTML = "";
  let mod;
  try {
    const res = await API.getModule(code);
    mod = res.module;
  } catch (e) {
    mod = OFFLINE.getCachedModule(code);
    if (!mod) { toast(t("common.error")); location.hash = "#/module/" + code; return; }
  }

  const engine = new ArEngine(app, mod.ar_scene, {
    onStepComplete: async (stepId) => {
      try {
        await API.completeStep(code, stepId);
      } catch (e) {
        OFFLINE.enqueue({ type: "step", code, stepId });
      }
    },
    onAllComplete: () => {
      toast(t("ar.all_complete"));
      location.hash = "#/assessment/" + code;
    },
    onExit: () => { location.hash = "#/module/" + code; },
  });
  await engine.mount();
});

// ---------------------------------------------------------- ASSESSMENT --
route("/assessment/:code", async ({ code }) => {
  if (!requireAuthOrRedirect()) return;
  loadingScreen();
  let data;
  try {
    data = await API.getAssessment(code);
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="error-box">${e.message}</div>
      <button class="btn secondary" onclick="location.hash='#/module/${code}'">${t("common.back")}</button></div>`;
    return;
  }
  const answers = {};
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><button class="back">\u2190</button><h2>${t("assess.title")}</h2></div>
      <div id="qs"></div>
      <button class="btn" id="submit">${t("assess.submit")}</button>
      <div id="result"></div>
    </div>`;
  app.querySelector(".back").onclick = () => (location.hash = "#/module/" + code);
  const qsEl = document.getElementById("qs");
  data.questions.forEach((q) => {
    const box = document.createElement("div");
    box.className = "card quiz-q";
    box.innerHTML = `<div class="prompt">${moduleField(q, "prompt")}</div>` +
      q.options.map((o) => `<button class="opt" data-qid="${q.id}" data-oid="${o.id}">${moduleField(o, "text")}</button>`).join("");
    qsEl.appendChild(box);
  });
  qsEl.querySelectorAll(".opt").forEach((b) => {
    b.onclick = () => {
      const qid = b.dataset.qid;
      answers[qid] = b.dataset.oid;
      qsEl.querySelectorAll(`.opt[data-qid="${qid}"]`).forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    };
  });
  document.getElementById("submit").onclick = async () => {
    if (Object.keys(answers).length < data.questions.length) {
      toast("Answer all questions");
      return;
    }
    const res = await API.submitAssessment(code, answers);
    const resEl = document.getElementById("result");
    if (res.passed) {
      resEl.innerHTML = `<div class="success-box">${t("assess.pass")} ${t("assess.score")}: ${res.score}%</div>
        <button class="btn" id="viewcert">${t("assess.view_cert")}</button>`;
      document.getElementById("viewcert").onclick = () => (location.hash = "#/certificates");
    } else {
      resEl.innerHTML = `<div class="error-box">${t("assess.fail")} ${t("assess.score")}: ${res.score}% (${t("assess.score")} \u2265 ${res.pass_score}% ${t("assess.score")})</div>
        <button class="btn secondary" id="retry">${t("assess.retry")}</button>`;
      document.getElementById("retry").onclick = () => (location.hash = "#/module/" + code);
    }
    document.getElementById("submit").classList.add("hidden");
  };
});

// --------------------------------------------------------- CERTIFICATES --
route("/certificates", async () => {
  if (!requireAuthOrRedirect()) return;
  loadingScreen();
  const res = await API.myCertificates();
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><h2>${t("nav.certs")}</h2></div>
      <div id="list"></div>
    </div>`;
  const list = document.getElementById("list");
  if (!res.certificates.length) {
    list.innerHTML = `<div class="card"><p class="muted">${t("cert.none")}</p></div>`;
    return;
  }
  res.certificates.forEach((c) => {
    const card = document.createElement("div");
    card.className = "cert-card";
    card.innerHTML = `
      <span class="status-pill valid">${t("cert.valid")}</span>
      <h3>${c.title_en}</h3>
      <img src="${c.card_url}" alt="certificate" />
      <div class="cert-code">${c.code}</div>
      <p class="muted" style="margin-top:8px;">${t("cert.issued")}: ${new Date(c.issued_at * 1000).toLocaleDateString()}</p>
      <div class="btn-row" style="margin-top:12px;">
        <a class="btn secondary" href="${c.card_url}" download="${c.code}.png">${t("cert.download")}</a>
        <button class="btn outline" data-code="${c.code}">${t("verify.title")}</button>
      </div>`;
    card.querySelector("[data-code]").onclick = () => (location.hash = "#/verify/" + c.code);
    list.appendChild(card);
  });
});

route("/verify/:code", async ({ code }) => {
  app.innerHTML = `<div class="center-col"><div class="spinner"></div><p>${t("verify.checking")}</p></div>`;
  let res;
  try {
    res = await API.verifyCertificate(code);
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="error-box">${t("verify.notfound")}</div></div>`;
    return;
  }
  const c = res.certificate;
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><h2>${t("verify.title")}</h2></div>
      <div class="cert-card">
        <span class="status-pill ${res.status}">${t("cert." + res.status)}</span>
        <h3>${c.worker_name}</h3>
        <p class="muted">${c.sector.toUpperCase()}</p>
        <img src="${API.certCardUrl(code)}" alt="certificate" />
        <div class="cert-code">${c.code}</div>
        <p style="margin-top:10px;">${c.module_title_en}</p>
        <p class="muted">${t("assess.score")}: ${c.score}%</p>
        <p class="muted">${t("cert.issued")}: ${new Date(c.issued_at * 1000).toLocaleDateString()} \u00b7 ${t("cert.expires")}: ${new Date(c.expires_at * 1000).toLocaleDateString()}</p>
      </div>
      <p class="muted" style="font-size:11px;text-align:center;margin-top:12px;line-height:1.5;">${t("cert.disclaimer")}</p>
    </div>`;
});

// ------------------------------------------------------------- DASHBOARD --
route("/dashboard", async () => {
  if (!requireAuthOrRedirect()) return;
  loadingScreen();
  const res = await API.dashboard();
  const d = res.dashboard;
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><h2>${t("dash.title")}</h2></div>
      <div class="card"><h3>${d.worker_name}</h3><p class="muted">${d.sector.toUpperCase()}</p></div>
      <div class="stat-grid">
        <div class="stat"><div class="n">${d.total_modules}</div><div class="l">${t("dash.total_modules")}</div></div>
        <div class="stat"><div class="n">${d.certified_modules}</div><div class="l">${t("dash.certified")}</div></div>
        <div class="stat"><div class="n">${d.in_progress_modules}</div><div class="l">${t("dash.in_progress")}</div></div>
        <div class="stat"><div class="n">${OFFLINE.queue().length}</div><div class="l">Pending sync</div></div>
      </div>
    </div>`;
});

// -------------------------------------------------------------- SETTINGS --
route("/settings", async () => {
  if (!requireAuthOrRedirect()) return;
  const worker = JSON.parse(localStorage.getItem("suraksha_worker") || "{}");
  const cacheTime = OFFLINE.cacheTime();
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><h2>${t("settings.title")}</h2></div>
      <div class="card"><h3>${worker.name || ""}</h3><p class="muted">${(worker.sector || "").toUpperCase()}</p></div>
      <div class="card">
        <h3>${t("settings.language")}</h3>
        ${langPill()}
      </div>
      <div class="card">
        <h3>${t("settings.offline_cache")}</h3>
        <p class="muted">${cacheTime ? t("settings.cached") + ": " + cacheTime.toLocaleString() : "Not cached yet"}</p>
        <div style="height:10px;"></div>
        <button class="btn secondary" id="cache-btn">${t("settings.cache_modules")}</button>
      </div>
      <button class="btn outline" id="admin-btn">${t("settings.admin")}</button>
      <div style="height:14px;"></div>
      <button class="btn danger" id="logout">${t("settings.logout")}</button>
    </div>`;
  bindLangPill(app, render);
  document.getElementById("cache-btn").onclick = async (ev) => {
    ev.target.textContent = t("common.loading");
    const n = await OFFLINE.cacheAllModules();
    toast(`Cached ${n} modules`);
    render();
  };
  document.getElementById("admin-btn").onclick = () => (location.hash = "#/admin");
  document.getElementById("logout").onclick = () => {
    localStorage.removeItem("suraksha_token");
    localStorage.removeItem("suraksha_worker");
    location.hash = "#/";
  };
});

// ---------------------------------------------------------------- ADMIN --
route("/admin", async () => {
  const savedKey = sessionStorage.getItem("suraksha_admin_key");
  if (!savedKey) {
    app.innerHTML = `
      <div class="screen">
        <div class="topbar"><h2>${t("admin.title")}</h2></div>
        <div class="field"><label>${t("admin.key")}</label><input type="password" id="key" /></div>
        <button class="btn" id="go">${t("admin.enter")}</button>
        <div id="err"></div>
      </div>`;
    document.getElementById("go").onclick = async () => {
      const key = document.getElementById("key").value;
      try {
        await API.adminOverview(key);
        sessionStorage.setItem("suraksha_admin_key", key);
        render();
      } catch (e) {
        document.getElementById("err").innerHTML = `<div class="error-box">Invalid key</div>`;
      }
    };
    return;
  }
  loadingScreen();
  const res = await API.adminOverview(savedKey);
  const o = res.overview;
  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <h2>${t("admin.title")}</h2>
        <button class="btn secondary" id="exit-admin" style="width:auto;padding:8px 12px;font-size:12px;">Exit</button>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="n">${o.total_workers}</div><div class="l">${t("admin.workers")}</div></div>
        <div class="stat"><div class="n">${o.total_certificates}</div><div class="l">${t("admin.certs")}</div></div>
        <div class="stat"><div class="n">${o.expired_certificates}</div><div class="l">${t("admin.expired")}</div></div>
        <div class="stat"><div class="n">${o.workers.length}</div><div class="l">Recent Signups</div></div>
      </div>
      <div class="card">
        <h3>${t("admin.by_sector")}</h3>
        <table class="admin-table"><thead><tr><th>Sector</th><th>Workers</th><th>Certified</th></tr></thead>
        <tbody>${o.by_sector.map((s) => `<tr><td>${s.sector}</td><td>${s.workers}</td><td>${s.certified}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="card">
        <h3>${t("admin.by_module")}</h3>
        <table class="admin-table"><thead><tr><th>Module</th><th>Certified</th><th>In progress</th></tr></thead>
        <tbody>${o.by_module.map((m) => `<tr><td>${m.title_en}</td><td>${m.certified}</td><td>${m.in_progress}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="card">
        <h3>${t("admin.recent")}</h3>
        <table class="admin-table"><thead><tr><th>Worker</th><th>Module</th><th>Score</th></tr></thead>
        <tbody>${o.recent_certificates.map((c) => `<tr><td>${c.worker_name}</td><td>${c.module_title}</td><td>${c.score}%</td></tr>`).join("")}</tbody></table>
      </div>
    </div>`;
  document.getElementById("exit-admin").onclick = () => {
    sessionStorage.removeItem("suraksha_admin_key");
    location.hash = "#/settings";
  };
});

// ------------------------------------------------------------------ boot --
if (!location.hash) location.hash = "#/";
render();
if (isLoggedIn()) OFFLINE.flush();
