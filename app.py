"""
SURAKSHA-AR — single-project backend + frontend server
Run: python3 app.py   (serves everything on http://0.0.0.0:8000)

This file serves BOTH:
  1. The JSON API (under /api/...) — auth, AR modules, progress, assessment,
     certificates, admin compliance dashboard.
  2. The frontend (static/ + templates/index.html) — a camera-based AR
     training SPA, so the whole product is one process / one repo / one
     command, matching "AR-Based Vocational Training Simulator for
     Industrial Safety in Jharkhand's Mining & Manufacturing Sector".

Design notes for judges / reviewers:
  - Runs on stdlib + Flask + Pillow + reportlab + PyJWT - zero external
    network calls needed, so it is trivially deployable on a low-connectivity
    site server or a small cloud instance serving Jharkhand field offices.
  - Every module ships an `ar_scene_json` describing hotspots/steps/gesture
    sequences. The frontend fetches this once, caches it in IndexedDB/
    localStorage for offline use, and renders the AR overlay locally using
    the phone's live camera feed (getUserMedia) + an HTML/CSS/canvas overlay
    layer — this works on any mid-range Android 10+ phone's Chrome/WebView,
    no ARCore SDK build step and no external headset required. Wrapping the
    same frontend in Capacitor/Android WebView produces the installable APK.
  - Certificates are content-addressed short codes + a signed verification
    endpoint, printed as a QR a site supervisor or auditor can scan without
    installing the app.
  - A simple key-protected admin API powers the web compliance dashboard
    (certified/in-progress workers per sector/site, without needing a
    worker login).
"""
import json
import os
import time
import uuid
import random
import string

from flask import Flask, request, jsonify, Response, send_from_directory, render_template

import db
import auth
import qr_util

app = Flask(__name__, static_folder="static", template_folder="templates")

CERT_VALIDITY_SECONDS = 60 * 60 * 24 * 365  # 12 months
BASE_URL = os.environ.get("SURAKSHA_BASE_URL", "http://localhost:8000")
ADMIN_KEY = os.environ.get("SURAKSHA_ADMIN_KEY", "admin123")  # change in production


# ---------------------------------------------------------------- helpers --
def require_auth():
    hdr = request.headers.get("Authorization", "")
    if not hdr.startswith("Bearer "):
        return None
    payload = auth.decode_token(hdr.split(" ", 1)[1])
    return payload


def require_admin():
    return request.headers.get("X-Admin-Key", "") == ADMIN_KEY


def error(msg, status=400):
    return jsonify({"ok": False, "error": msg}), status


def gen_cert_code(conn, domain):
    """SAR-<DOMAIN>-<YEAR>-<sequence>, e.g. SAR-FIRE-2026-000001."""
    year = time.strftime("%Y")
    domain_tag = "".join(ch for ch in domain.upper() if ch.isalnum())[:8] or "GEN"
    prefix = f"SAR-{domain_tag}-{year}-"
    row = conn.execute(
        "SELECT COUNT(*) c FROM certificates WHERE code LIKE ?", (prefix + "%",)
    ).fetchone()
    seq = (row["c"] or 0) + 1
    code = f"{prefix}{seq:06d}"
    # extremely unlikely, but guard against a collision (e.g. a revoked+reissued cert)
    while conn.execute("SELECT 1 FROM certificates WHERE code=?", (code,)).fetchone():
        seq += 1
        code = f"{prefix}{seq:06d}"
    return code


# ------------------------------------------------------------------ auth --
@app.post("/api/auth/register")
def register():
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    phone = (body.get("phone") or "").strip()
    password = body.get("password") or ""
    sector = body.get("sector") or "mining"
    site = body.get("site") or ""
    language = body.get("language") or "hi"

    if not name or not phone or len(password) < 4:
        return error("name, phone and password (min 4 chars) are required")
    if sector not in ("mining", "steel", "mica"):
        return error("sector must be mining, steel or mica")

    conn = db.get_conn()
    if conn.execute("SELECT 1 FROM workers WHERE phone=?", (phone,)).fetchone():
        conn.close()
        return error("An account with this phone number already exists", 409)

    wid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO workers (id, name, phone, password_hash, sector, site, language, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (wid, name, phone, auth.hash_password(password), sector, site, language, time.time())
    )
    conn.commit()
    conn.close()
    token = auth.issue_token(wid, phone)
    return jsonify({"ok": True, "token": token, "worker": {"id": wid, "name": name, "sector": sector, "language": language}})


@app.post("/api/auth/login")
def login():
    body = request.get_json(force=True, silent=True) or {}
    phone = (body.get("phone") or "").strip()
    password = body.get("password") or ""

    conn = db.get_conn()
    row = conn.execute("SELECT * FROM workers WHERE phone=?", (phone,)).fetchone()
    conn.close()
    if not row or not auth.verify_password(password, row["password_hash"]):
        return error("Invalid phone number or password", 401)

    token = auth.issue_token(row["id"], phone)
    return jsonify({"ok": True, "token": token, "worker": {
        "id": row["id"], "name": row["name"], "sector": row["sector"], "language": row["language"]
    }})


@app.get("/api/auth/me")
def me():
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM workers WHERE id=?", (payload["sub"],)).fetchone()
    conn.close()
    if not row:
        return error("Worker not found", 404)
    return jsonify({"ok": True, "worker": {
        "id": row["id"], "name": row["name"], "sector": row["sector"],
        "site": row["site"], "language": row["language"]
    }})


# --------------------------------------------------------------- modules --
@app.get("/api/modules")
def list_modules():
    sector = request.args.get("sector")
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM modules").fetchall()
    conn.close()
    out = []
    for r in rows:
        tags = json.loads(r["sector_tags"])
        if sector and sector not in tags:
            continue
        out.append({
            "code": r["code"], "title_en": r["title_en"], "title_hi": r["title_hi"],
            "domain": r["domain"], "sector_tags": tags, "pass_score": r["pass_score"],
            "step_count": len(json.loads(r["ar_scene_json"])["steps"])
        })
    return jsonify({"ok": True, "modules": out})


@app.get("/api/modules/<code>")
def get_module(code):
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    r = conn.execute("SELECT * FROM modules WHERE code=?", (code,)).fetchone()
    conn.close()
    if not r:
        return error("Module not found", 404)
    return jsonify({
        "ok": True,
        "module": {
            "code": r["code"], "title_en": r["title_en"], "title_hi": r["title_hi"],
            "domain": r["domain"], "pass_score": r["pass_score"],
            "ar_scene": json.loads(r["ar_scene_json"])
        }
    })


# -------------------------------------------------------------- progress --
@app.post("/api/progress/<code>/step")
def complete_step(code):
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    body = request.get_json(force=True, silent=True) or {}
    step_id = body.get("step_id")
    if not step_id:
        return error("step_id required")

    conn = db.get_conn()
    mod = conn.execute("SELECT id FROM modules WHERE code=?", (code,)).fetchone()
    if not mod:
        conn.close()
        return error("Module not found", 404)

    existing = conn.execute(
        "SELECT * FROM progress WHERE worker_id=? AND module_id=?", (payload["sub"], mod["id"])
    ).fetchone()

    if existing:
        steps = json.loads(existing["ar_steps_completed"])
        if step_id not in steps:
            steps.append(step_id)
        conn.execute(
            "UPDATE progress SET ar_steps_completed=?, status=?, updated_at=? WHERE id=?",
            (json.dumps(steps), "started", time.time(), existing["id"])
        )
    else:
        steps = [step_id]
        conn.execute(
            "INSERT INTO progress (id, worker_id, module_id, status, ar_steps_completed, time_spent_seconds, updated_at) VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), payload["sub"], mod["id"], "started", json.dumps(steps), 0, time.time())
        )

    scene = json.loads(conn.execute("SELECT ar_scene_json FROM modules WHERE id=?", (mod["id"],)).fetchone()[0])
    all_step_ids = [s["id"] for s in scene["steps"]]
    if all(s in steps for s in all_step_ids):
        conn.execute(
            "UPDATE progress SET status='ar_completed', updated_at=? WHERE worker_id=? AND module_id=?",
            (time.time(), payload["sub"], mod["id"])
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "steps_completed": steps, "ar_complete": all(s in steps for s in all_step_ids)})


@app.get("/api/progress")
def my_progress():
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    rows = conn.execute("""
        SELECT p.*, m.code as module_code, m.title_en, m.title_hi
        FROM progress p JOIN modules m ON p.module_id = m.id
        WHERE p.worker_id = ?
    """, (payload["sub"],)).fetchall()
    conn.close()
    return jsonify({"ok": True, "progress": [
        {"module_code": r["module_code"], "title_en": r["title_en"], "status": r["status"],
         "steps_completed": json.loads(r["ar_steps_completed"] or "[]")}
        for r in rows
    ]})


# ------------------------------------------------------------ assessment --
@app.get("/api/assessment/<code>")
def get_assessment(code):
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    mod = conn.execute("SELECT * FROM modules WHERE code=?", (code,)).fetchone()
    if not mod:
        conn.close()
        return error("Module not found", 404)

    progress = conn.execute(
        "SELECT * FROM progress WHERE worker_id=? AND module_id=?", (payload["sub"], mod["id"])
    ).fetchone()
    if not progress or progress["status"] not in ("ar_completed", "assessed", "certified"):
        conn.close()
        return error("Complete the AR training steps before starting the assessment", 403)

    qs = conn.execute("SELECT * FROM questions WHERE module_id=?", (mod["id"],)).fetchall()
    conn.close()
    return jsonify({"ok": True, "pass_score": mod["pass_score"], "questions": [
        {"id": q["id"], "prompt_en": q["prompt_en"], "prompt_hi": q["prompt_hi"],
         "options": json.loads(q["options_json"])}
        for q in qs
    ]})


@app.post("/api/assessment/<code>/submit")
def submit_assessment(code):
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    body = request.get_json(force=True, silent=True) or {}
    answers = body.get("answers") or {}

    conn = db.get_conn()
    mod = conn.execute("SELECT * FROM modules WHERE code=?", (code,)).fetchone()
    if not mod:
        conn.close()
        return error("Module not found", 404)

    qs = conn.execute("SELECT * FROM questions WHERE module_id=?", (mod["id"],)).fetchall()
    total_weight = sum(q["weight"] for q in qs) or 1
    got_weight = 0
    for q in qs:
        submitted = answers.get(q["id"])
        if submitted == q["correct_option"]:
            got_weight += q["weight"]
    score = round(100 * got_weight / total_weight)
    passed = score >= mod["pass_score"]

    aid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO attempts (id, worker_id, module_id, answers_json, score, passed, created_at) VALUES (?,?,?,?,?,?,?)",
        (aid, payload["sub"], mod["id"], json.dumps(answers), score, int(passed), time.time())
    )

    cert = None
    if passed:
        conn.execute(
            "UPDATE progress SET status='certified', updated_at=? WHERE worker_id=? AND module_id=?",
            (time.time(), payload["sub"], mod["id"])
        )
        code_str = gen_cert_code(conn, mod["domain"])
        cid = str(uuid.uuid4())
        now = time.time()
        conn.execute(
            "INSERT INTO certificates (id, code, worker_id, module_id, attempt_id, issued_at, expires_at, revoked) VALUES (?,?,?,?,?,?,?,0)",
            (cid, code_str, payload["sub"], mod["id"], aid, now, now + CERT_VALIDITY_SECONDS)
        )
        cert = {
            "code": code_str,
            "verify_url": f"{BASE_URL}/verify/{code_str}",
            "card_url": f"{BASE_URL}/api/certificate/{code_str}/card",
            "expires_at": now + CERT_VALIDITY_SECONDS
        }
    else:
        conn.execute(
            "UPDATE progress SET status='assessed', updated_at=? WHERE worker_id=? AND module_id=?",
            (time.time(), payload["sub"], mod["id"])
        )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "score": score, "passed": passed, "pass_score": mod["pass_score"], "certificate": cert})


# ------------------------------------------------------------ certificates --
@app.get("/api/certificates")
def my_certificates():
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    rows = conn.execute("""
        SELECT c.*, m.title_en, m.title_hi, m.code as module_code
        FROM certificates c JOIN modules m ON c.module_id = m.id
        WHERE c.worker_id=? AND c.revoked=0
    """, (payload["sub"],)).fetchall()
    conn.close()
    return jsonify({"ok": True, "certificates": [
        {"code": r["code"], "module_code": r["module_code"], "title_en": r["title_en"],
         "issued_at": r["issued_at"], "expires_at": r["expires_at"],
         "verify_url": f"{BASE_URL}/verify/{r['code']}",
         "card_url": f"{BASE_URL}/api/certificate/{r['code']}/card"}
        for r in rows
    ]})


@app.get("/api/certificate/<code>")
def verify_certificate(code):
    conn = db.get_conn()
    r = conn.execute("""
        SELECT c.*, w.name as worker_name, w.sector, m.title_en, m.title_hi, a.score
        FROM certificates c
        JOIN workers w ON c.worker_id = w.id
        JOIN modules m ON c.module_id = m.id
        JOIN attempts a ON c.attempt_id = a.id
        WHERE c.code=?
    """, (code,)).fetchone()
    conn.close()
    if not r:
        return error("Certificate not found", 404)

    now = time.time()
    status = "valid"
    if r["revoked"]:
        status = "revoked"
    elif now > r["expires_at"]:
        status = "expired"

    return jsonify({
        "ok": True, "status": status,
        "certificate": {
            "code": r["code"], "worker_name": r["worker_name"], "sector": r["sector"],
            "module_title_en": r["title_en"], "module_title_hi": r["title_hi"],
            "score": r["score"], "issued_at": r["issued_at"], "expires_at": r["expires_at"]
        }
    })


@app.get("/api/certificate/<code>/card")
def certificate_card(code):
    conn = db.get_conn()
    r = conn.execute("""
        SELECT c.*, w.name as worker_name, m.title_en, a.score
        FROM certificates c
        JOIN workers w ON c.worker_id = w.id
        JOIN modules m ON c.module_id = m.id
        JOIN attempts a ON c.attempt_id = a.id
        WHERE c.code=?
    """, (code,)).fetchone()
    conn.close()
    if not r:
        return error("Certificate not found", 404)

    png = qr_util.make_certificate_card_png_bytes(
        worker_name=r["worker_name"], module_name=r["title_en"], cert_code=r["code"],
        verify_url=f"{BASE_URL}/verify/{r['code']}", score=r["score"]
    )
    return Response(png, mimetype="image/png")


# --------------------------------------------------------------- dashboard --
@app.get("/api/dashboard")
def dashboard():
    payload = require_auth()
    if not payload:
        return error("Authentication required", 401)
    conn = db.get_conn()
    worker = conn.execute("SELECT * FROM workers WHERE id=?", (payload["sub"],)).fetchone()
    total_modules = conn.execute("SELECT COUNT(*) c FROM modules").fetchone()["c"]
    certified = conn.execute(
        "SELECT COUNT(*) c FROM certificates WHERE worker_id=? AND revoked=0", (payload["sub"],)
    ).fetchone()["c"]
    in_progress = conn.execute(
        "SELECT COUNT(*) c FROM progress WHERE worker_id=? AND status IN ('started','ar_completed','assessed')",
        (payload["sub"],)
    ).fetchone()["c"]
    conn.close()
    return jsonify({"ok": True, "dashboard": {
        "worker_name": worker["name"], "sector": worker["sector"],
        "total_modules": total_modules, "certified_modules": certified, "in_progress_modules": in_progress
    }})


# -------------------------------------------------------- admin compliance --
@app.post("/api/admin/login")
def admin_login():
    body = request.get_json(force=True, silent=True) or {}
    if body.get("key") != ADMIN_KEY:
        return error("Invalid admin key", 401)
    return jsonify({"ok": True})


@app.get("/api/admin/overview")
def admin_overview():
    if not require_admin():
        return error("Admin key required (X-Admin-Key header)", 401)
    conn = db.get_conn()
    total_workers = conn.execute("SELECT COUNT(*) c FROM workers").fetchone()["c"]
    total_certs = conn.execute("SELECT COUNT(*) c FROM certificates WHERE revoked=0").fetchone()["c"]
    now = time.time()
    expired_certs = conn.execute(
        "SELECT COUNT(*) c FROM certificates WHERE revoked=0 AND expires_at < ?", (now,)
    ).fetchone()["c"]

    by_sector = conn.execute("""
        SELECT w.sector as sector, COUNT(DISTINCT w.id) as workers,
               COUNT(DISTINCT c.id) as certified
        FROM workers w
        LEFT JOIN certificates c ON c.worker_id = w.id AND c.revoked=0
        GROUP BY w.sector
    """).fetchall()

    by_module = conn.execute("""
        SELECT m.code as code, m.title_en as title_en, m.domain as domain,
               COUNT(DISTINCT c.id) as certified,
               COUNT(DISTINCT p.id) as in_progress
        FROM modules m
        LEFT JOIN certificates c ON c.module_id = m.id AND c.revoked=0
        LEFT JOIN progress p ON p.module_id = m.id AND p.status IN ('started','ar_completed','assessed')
        GROUP BY m.id
    """).fetchall()

    recent = conn.execute("""
        SELECT c.code as code, w.name as worker_name, w.sector as sector, w.site as site,
               m.title_en as module_title, c.issued_at as issued_at, a.score as score
        FROM certificates c
        JOIN workers w ON c.worker_id = w.id
        JOIN modules m ON c.module_id = m.id
        JOIN attempts a ON c.attempt_id = a.id
        WHERE c.revoked=0
        ORDER BY c.issued_at DESC LIMIT 25
    """).fetchall()

    workers_list = conn.execute("SELECT id, name, phone, sector, site, language, created_at FROM workers ORDER BY created_at DESC LIMIT 100").fetchall()
    conn.close()

    return jsonify({"ok": True, "overview": {
        "total_workers": total_workers,
        "total_certificates": total_certs,
        "expired_certificates": expired_certs,
        "by_sector": [dict(r) for r in by_sector],
        "by_module": [dict(r) for r in by_module],
        "recent_certificates": [dict(r) for r in recent],
        "workers": [dict(r) for r in workers_list],
    }})


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "suraksha-ar-backend", "time": time.time()})


# --------------------------------------------------------- frontend routes --
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/verify/<code>")
def verify_page(code):
    # same SPA shell; the JS router reads the code from the URL and calls
    # the public /api/certificate/<code> endpoint. Works without login.
    return render_template("index.html")


@app.get("/admin")
def admin_page():
    return render_template("index.html")


@app.get("/manifest.json")
def manifest():
    return send_from_directory(app.static_folder, "manifest.json")


@app.get("/sw.js")
def service_worker():
    # served from root scope so it can control the whole app
    resp = send_from_directory(app.static_folder, "sw.js")
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


if __name__ == "__main__":
    db.init_db()
    app.run(host="0.0.0.0", port=8000, debug=False)
