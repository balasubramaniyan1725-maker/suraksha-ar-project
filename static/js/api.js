// api.js — thin wrapper around fetch() for the SURAKSHA-AR backend.
const API = {
  base: "", // same-origin, since Flask serves both frontend and API

  token() {
    return localStorage.getItem("suraksha_token") || "";
  },

  async req(method, path, body, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token() && !opts.noAuth) headers["Authorization"] = "Bearer " + this.token();
    if (opts.adminKey) headers["X-Admin-Key"] = opts.adminKey;

    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new Error("NETWORK_OFFLINE");
      err.offline = true;
      throw err;
    }
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path, opts) { return this.req("GET", path, null, opts); },
  post(path, body, opts) { return this.req("POST", path, body, opts); },

  // ---- auth ----
  register(payload) { return this.post("/api/auth/register", payload, { noAuth: true }); },
  login(payload) { return this.post("/api/auth/login", payload, { noAuth: true }); },
  me() { return this.get("/api/auth/me"); },

  // ---- modules ----
  listModules(sector) { return this.get("/api/modules" + (sector ? `?sector=${sector}` : "")); },
  getModule(code) { return this.get(`/api/modules/${code}`); },

  // ---- progress ----
  completeStep(code, stepId) { return this.post(`/api/progress/${code}/step`, { step_id: stepId }); },
  myProgress() { return this.get("/api/progress"); },

  // ---- assessment ----
  getAssessment(code) { return this.get(`/api/assessment/${code}`); },
  submitAssessment(code, answers) { return this.post(`/api/assessment/${code}/submit`, { answers }); },

  // ---- certificates ----
  myCertificates() { return this.get("/api/certificates"); },
  verifyCertificate(code) { return this.get(`/api/certificate/${code}`, { noAuth: true }); },
  certCardUrl(code) { return `/api/certificate/${code}/card`; },

  // ---- dashboard ----
  dashboard() { return this.get("/api/dashboard"); },

  // ---- admin ----
  adminOverview(key) { return this.get("/api/admin/overview", { adminKey: key, noAuth: true }); },
};
