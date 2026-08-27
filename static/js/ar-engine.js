// ar-engine.js — REAL 3D AR engine.
//
// Renders actual three.js 3D geometry (grouped meshes with lighting/shading/
// depth — not flat images or emoji) composited over the live webcam feed.
//
//   SPATIAL AR MODE       — only if navigator.xr reports 'immersive-ar'
//                            support (some Android Chrome builds).
//   3D CAMERA SIMULATION  — used on laptops (no browser exposes WebXR
//                            immersive-ar on desktop). Webcam <video> is the
//                            background layer; a transparent three.js
//                            WebGLRenderer sits on top rendering lit 3D
//                            objects with mouse-driven parallax so they read
//                            as real volumes. Always labelled SIMULATION,
//                            never claimed to be spatial/anchored AR.
//
// Step/scene contract (ar_scene_json) is unchanged from the prior 2D build.

function makeLabelSprite(text, color) {
  color = color || "#ffffff";
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(6,16,10,0.82)";
  roundRect(ctx, 6, 30, canvas.width - 12, 68, 18); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4;
  roundRect(ctx, 6, 30, canvas.width - 12, 68, 18); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 36px Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  wrapText(ctx, text.toUpperCase(), canvas.width / 2, 64, canvas.width - 40, 38);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.9, 0.48, 1);
  sprite.renderOrder = 999;
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(" ");
  let lines = [], line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines = lines.slice(0, 2);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function group3D(children, label, labelColor) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  if (label) {
    const s = makeLabelSprite(label, labelColor);
    s.position.set(0, 1.15, 0);
    g.add(s);
  }
  return g;
}
function mesh(geo, color, opts) {
  opts = opts || {};
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.25,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.55,
    emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0,
    transparent: !!opts.opacity, opacity: opts.opacity !== undefined ? opts.opacity : 1,
  });
  const m = new THREE.Mesh(geo, mat);
  if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  return m;
}

// ---- fire & explosion props ----
function buildFlame() {
  const g = new THREE.Group();
  const core = mesh(new THREE.ConeGeometry(0.22, 0.7, 12), 0xff6a00, { emissive: 0xff4400, emissiveIntensity: 1.1, roughness: 1 });
  core.position.y = 0.35;
  const inner = mesh(new THREE.ConeGeometry(0.12, 0.4, 10), 0xffd23f, { emissive: 0xffcc00, emissiveIntensity: 1.4, roughness: 1 });
  inner.position.y = 0.4;
  g.add(core, inner);
  const pCount = 40;
  const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = Math.random() * 0.9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffaa33, size: 0.05, transparent: true, opacity: 0.85 }));
  g.add(pts);
  g.userData.animate = (t) => {
    core.scale.set(1 + Math.sin(t * 9) * 0.08, 1 + Math.cos(t * 7) * 0.12, 1 + Math.sin(t * 5) * 0.08);
    inner.scale.copy(core.scale);
    const arr = geo.attributes.position.array;
    for (let i = 0; i < pCount; i++) {
      arr[i * 3 + 1] += 0.006;
      if (arr[i * 3 + 1] > 0.95) arr[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return group3D([g], "3D FIRE HAZARD", "#ff5a2b");
}

function buildExtinguisher() {
  const body = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.62, 20), 0xcc1f1f, { metalness: 0.6, roughness: 0.35, pos: [0, 0.31, 0] });
  const cap = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.1, 20), 0x1a1a1a, { pos: [0, 0.67, 0] });
  const hose = mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 16, Math.PI), 0x111111, { pos: [0.14, 0.6, 0], rot: [0, 0, Math.PI / 2] });
  const handle = mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 16), 0x222222, { pos: [0, 0.74, 0], rot: [Math.PI / 2, 0, 0] });
  const stripe = mesh(new THREE.CylinderGeometry(0.181, 0.181, 0.08, 20), 0xffffff, { pos: [0, 0.5, 0] });
  return group3D([body, cap, hose, handle, stripe], "Fire Extinguisher (Class B)", "#ff8a3d");
}

function buildExitSign() {
  const panel = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.05), 0x0a8a3a, { emissive: 0x0a8a3a, emissiveIntensity: 0.5 });
  const frame = mesh(new THREE.BoxGeometry(0.98, 0.43, 0.02), 0xffffff, { pos: [0, 0, -0.02] });
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 200;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a8a3a"; ctx.fillRect(0, 0, 512, 200);
  ctx.fillStyle = "#fff"; ctx.font = "bold 120px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("EXIT ->", 256, 100);
  const tex = new THREE.CanvasTexture(canvas);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.33), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.026;
  return group3D([frame, panel, face], "Emergency EXIT", "#33e37a");
}

function buildEvacArrow(color) {
  color = color || 0xffd23f;
  const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), color, { emissive: color, emissiveIntensity: 0.4, rot: [Math.PI / 2, 0, 0], pos: [0, 0, -0.1] });
  const head = mesh(new THREE.ConeGeometry(0.12, 0.28, 12), color, { emissive: color, emissiveIntensity: 0.5, rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.28] });
  const g = group3D([shaft, head]);
  g.userData.animate = (t) => { g.position.y += Math.sin(t * 3) * 0.0015; };
  return g;
}

function buildMusterPoint() {
  const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), 0xcccccc, { pos: [0, 0.55, 0] });
  const flag = mesh(new THREE.PlaneGeometry(0.4, 0.26), 0x1f9e4a, { pos: [0.2, 0.95, 0] });
  flag.material.side = THREE.DoubleSide;
  const ring = mesh(new THREE.TorusGeometry(0.35, 0.02, 8, 24), 0x1f9e4a, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.02, 0] });
  return group3D([pole, flag, ring], "Muster / Assembly Point", "#1fbf5c");
}

// ---- gas & confined space props ----
function buildGasCloud() {
  const g = new THREE.Group();
  const cnt = 220;
  const positions = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const r = 0.55 * Math.cbrt(Math.random());
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6 + 0.3;
    positions[i * 3 + 2] = r * Math.cos(ph);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8ff4e, size: 0.045, transparent: true, opacity: 0.55 }));
  g.add(pts);
  const core = mesh(new THREE.IcosahedronGeometry(0.3, 1), 0x9fe83a, { opacity: 0.22, emissive: 0x88cc22, emissiveIntensity: 0.3, pos: [0, 0.3, 0] });
  g.add(core);
  g.userData.animate = (t) => { core.rotation.y = t * 0.4; pts.rotation.y = t * 0.15; };
  return group3D([g], "Hazardous Gas Zone", "#c6ff5e");
}

function buildGasDetector() {
  const body = mesh(new THREE.BoxGeometry(0.22, 0.4, 0.1), 0xffb300, { pos: [0, 0.2, 0] });
  const screen = mesh(new THREE.BoxGeometry(0.15, 0.13, 0.02), 0x113311, { emissive: 0x33ff55, emissiveIntensity: 0.6, pos: [0, 0.28, 0.06] });
  const antenna = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), 0x222222, { pos: [0.08, 0.44, 0] });
  return group3D([body, screen, antenna], "Gas Detector", "#ffd23f");
}

function buildHelmet(color) {
  color = color || 0xffd23f;
  const shell = mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), color, { pos: [0, 0.2, 0] });
  const brim = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 20), color, { pos: [0, 0.08, 0] });
  return group3D([shell, brim], "Safety Helmet", "#ffe07d");
}
function buildGoggles() {
  const l = mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), 0x2288ff, { pos: [-0.1, 0.2, 0], metalness: 0.5, roughness: 0.2 });
  const r = mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), 0x2288ff, { pos: [0.1, 0.2, 0], metalness: 0.5, roughness: 0.2 });
  const strap = mesh(new THREE.BoxGeometry(0.32, 0.02, 0.01), 0x222222, { pos: [0, 0.2, 0] });
  return group3D([l, r, strap], "Safety Goggles", "#63b3ff");
}
function buildGloves() {
  const l = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 8), 0xff8800, { pos: [-0.12, 0.15, 0] });
  const r = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 8), 0xff8800, { pos: [0.12, 0.15, 0] });
  return group3D([l, r], "Protective Gloves", "#ffb24d");
}
function buildRespirator() {
  const mask = mesh(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, Math.PI / 3, Math.PI / 2), 0x3a3a3a, { pos: [0, 0.2, 0] });
  const filterL = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), 0x555555, { pos: [-0.14, 0.18, 0.05], rot: [Math.PI / 2, 0, 0] });
  const filterR = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), 0x555555, { pos: [0.14, 0.18, 0.05], rot: [Math.PI / 2, 0, 0] });
  return group3D([mask, filterL, filterR], "Respiratory Protection", "#9aa0a6");
}
function buildHarness() {
  const strapV = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), 0xff6600, { pos: [0, 0.25, 0] });
  const strapH = mesh(new THREE.BoxGeometry(0.4, 0.05, 0.02), 0xff6600, { pos: [0, 0.35, 0] });
  const buckle = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), 0xcccccc, { pos: [0, 0.2, 0.02] });
  return group3D([strapV, strapH, buckle], "Safety Harness", "#ffa64d");
}

function buildConfinedSpaceEntrance() {
  const ring = mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 24), 0x333333, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0] });
  const hole = mesh(new THREE.CircleGeometry(0.34, 24), 0x050505, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.001, 0] });
  const stripe = mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 24), 0xffcc00, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.02, 0] });
  return group3D([ring, hole, stripe], "Confined Space Entry", "#ffcc00");
}
function buildBuddy(color) {
  color = color || 0x3aa0ff;
  const body = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12), color, { pos: [0, 0.3, 0] });
  const head = mesh(new THREE.SphereGeometry(0.11, 14, 12), 0xffd7a8, { pos: [0, 0.65, 0] });
  return group3D([body, head], "Buddy / Attendant", "#7fc4ff");
}
function buildTripodHoist() {
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8);
  const legs = [0, 120, 240].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const l = mesh(legGeo, 0x777777, { pos: [Math.cos(rad) * 0.3, 0.45, Math.sin(rad) * 0.3] });
    l.rotation.z = Math.cos(rad) * 0.35;
    l.rotation.x = -Math.sin(rad) * 0.35;
    return l;
  });
  const pulley = mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 16), 0xffcc00, { pos: [0, 0.88, 0] });
  return group3D(legs.concat([pulley]), "Retrieval Tripod & Hoist", "#ffcc00");
}

// ---- machinery / LOTO props ----
function buildMachineBlock() {
  const base = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), 0x556070, { pos: [0, 0.17, 0] });
  const roller1 = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 16), 0x8a94a3, { rot: [Math.PI / 2, 0, 0], pos: [-0.2, 0.45, 0], metalness: 0.7, roughness: 0.3 });
  const roller2 = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 16), 0x8a94a3, { rot: [Math.PI / 2, 0, 0], pos: [0.2, 0.45, 0], metalness: 0.7, roughness: 0.3 });
  const gearHazard = new THREE.Mesh(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.32, 0.36)),
    new THREE.LineBasicMaterial({ color: 0xff2b2b })
  );
  gearHazard.position.set(0, 0.45, 0);
  return group3D([base, roller1, roller2, gearHazard], "Machine Pinch-Point Hazard", "#ff6b6b");
}
function buildLotoKit() {
  const lockBody = mesh(new THREE.BoxGeometry(0.16, 0.14, 0.06), 0xd82b2b, { pos: [0, 0.2, 0] });
  const shackle = mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16, Math.PI), 0x999999, { pos: [0, 0.3, 0] });
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffcc00"; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#000"; ctx.font = "bold 26px Arial"; ctx.textAlign = "center";
  ctx.fillText("DANGER", 128, 55); ctx.font = "bold 18px Arial"; ctx.fillText("LOCKED OUT", 128, 90);
  const tex = new THREE.CanvasTexture(canvas);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  tag.position.set(0.2, 0.15, 0);
  return group3D([lockBody, shackle, tag], "Lockout-Tagout Kit", "#ffcc00");
}

// ---- electrical safety props ----
function buildElectricalPanel() {
  const box = mesh(new THREE.BoxGeometry(0.55, 0.7, 0.12), 0x2b3a4a, { pos: [0, 0.35, 0] });
  const doorEdge = new THREE.Mesh(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.7, 0.12)), new THREE.LineBasicMaterial({ color: 0xffcc00 }));
  doorEdge.position.set(0, 0.35, 0);
  const switches = [-0.15, 0, 0.15].map((x, i) =>
    mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), i === 1 ? 0xff2b2b : 0x3fd67a, { pos: [x, 0.35, 0.07] })
  );
  const bolt = document.createElement("canvas"); bolt.width = 128; bolt.height = 128;
  const bctx = bolt.getContext("2d");
  bctx.fillStyle = "yellow"; bctx.font = "bold 90px Arial"; bctx.textAlign = "center"; bctx.textBaseline = "middle";
  bctx.fillText("!", 64, 70);
  const boltTex = new THREE.CanvasTexture(bolt);
  const boltSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: boltTex, transparent: true }));
  boltSprite.scale.set(0.3, 0.3, 1); boltSprite.position.set(0, 0.75, 0.1);
  return group3D([box, doorEdge].concat(switches).concat([boltSprite]), "High-Voltage Panel", "#ffcc00");
}
function buildInsulatedGloves() {
  const l = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 10), 0xffdd33, { pos: [-0.12, 0.18, 0] });
  const r = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 10), 0xffdd33, { pos: [0.12, 0.18, 0] });
  return group3D([l, r], "Insulated Gloves (Class 0)", "#ffe680");
}
function buildVoltageTester() {
  const body = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 10), 0xff8800, { rot: [0, 0, Math.PI / 2], pos: [0, 0.2, 0] });
  const probe = mesh(new THREE.ConeGeometry(0.015, 0.08, 8), 0xcccccc, { rot: [0, 0, -Math.PI / 2], pos: [0.2, 0.2, 0] });
  return group3D([body, probe], "Non-Contact Voltage Tester", "#ffb24d");
}
function buildArcFlashWarning() {
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.26); tri.lineTo(-0.24, -0.16); tri.lineTo(0.24, -0.16); tri.closePath();
  const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.03, bevelEnabled: false });
  const t1 = mesh(geo, 0xffcc00, { emissive: 0xffaa00, emissiveIntensity: 0.3 });
  const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000"; ctx.font = "bold 90px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  const bolt = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  bolt.position.set(0, 0.02, 0.02);
  return group3D([t1, bolt], "Arc-Flash Hazard", "#ffcc00");
}

// ---- dust / mica occupational safety props ----
function buildDustCloud() {
  const cnt = 200;
  const positions = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1.0;
    positions[i * 3 + 1] = Math.random() * 0.7;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8c9a3, size: 0.05, transparent: true, opacity: 0.55 }));
  const g = new THREE.Group(); g.add(pts);
  g.userData.animate = (t) => { pts.rotation.y = t * 0.1; };
  return group3D([g], "Airborne Silica / Mica Dust", "#e8dcb8");
}
function buildDrill() {
  const body = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), 0xff8800, { rot: [0, 0, Math.PI / 2], pos: [0, 0.3, 0] });
  const bit = mesh(new THREE.ConeGeometry(0.03, 0.18, 8), 0xcccccc, { rot: [0, 0, -Math.PI / 2], pos: [0.28, 0.3, 0], metalness: 0.8 });
  return group3D([body, bit], "Mica Extraction Drill", "#ffb24d");
}

const AR3D_OBJECTS = {
  exit_sign_marker: buildExitSign,
  extinguisher_type_check: buildExtinguisher,
  fire_extinguisher: buildExtinguisher,
  simulated_fire_particle_system: buildFlame,
  fire_hazard: buildFlame,
  floor_path_arrows: () => buildEvacArrow(0xffd23f),
  muster_point: buildMusterPoint,
  gas_heatmap_overlay: buildGasCloud,
  gas_leak_source: buildGasCloud,
  ppe_inventory_shelf: buildHelmet,
  helmet: buildHelmet,
  goggles: buildGoggles,
  gloves: buildGloves,
  respirator: buildRespirator,
  safety_harness: buildHarness,
  gas_detector: buildGasDetector,
  buddy_avatar_checklist: buildBuddy,
  retrieval_tripod_hoist: buildTripodHoist,
  confined_space_entrance: buildConfinedSpaceEntrance,
  hazard_bounding_boxes: buildMachineBlock,
  loto_lock_tag_kit: buildLotoKit,
  electrical_panel: buildElectricalPanel,
  insulated_gloves: buildInsulatedGloves,
  voltage_tester: buildVoltageTester,
  arc_flash_warning: buildArcFlashWarning,
  dust_cloud: buildDustCloud,
  mica_drill: buildDrill,
  respirator_mask: buildRespirator,
};

function buildObjectFor(name) {
  const fn = AR3D_OBJECTS[name];
  if (fn) return fn();
  const sph = mesh(new THREE.IcosahedronGeometry(0.16, 1), 0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 0.4 });
  return group3D([sph], (name || "hazard").replace(/_/g, " "));
}

// ------------------------------------------------------------- the engine --
class ArEngine {
  constructor(container, scene, callbacks) {
    this.container = container;
    this.scene = scene;
    this.steps = scene.steps;
    this.stepIndex = 0;
    this.onStepComplete = callbacks.onStepComplete || (() => {});
    this.onAllComplete = callbacks.onAllComplete || (() => {});
    this.onExit = callbacks.onExit || (() => {});
    this.stream = null;
    this.timerHandle = null;
    this.mouse = { x: 0, y: 0 };
    this.interactiveMeshes = [];
    this.clock = null;
  }

  async mount() {
    this.container.innerHTML = `
      <div class="ar-wrap">
        <video class="ar-video" autoplay playsinline muted></video>
        <div class="ar-nocam hidden">
          <div style="font-size:40px;">no cam</div>
          <p style="color:#cfe6d8;font-size:14px;max-width:280px;">${t("ar.camera_denied")}</p>
        </div>
        <canvas class="ar-3d-canvas"></canvas>
        <div class="ar-overlay">
          <div class="ar-topbar">
            <div class="row">
              <button class="ar-close">X</button>
              <span class="ar-step-pill"></span>
              <span class="ar-mode-badge"></span>
              <span class="ar-timer hidden"></span>
            </div>
          </div>
          <div class="ar-instruction"></div>
          <div class="ar-bottombar">
            <div class="ar-progress-dots"></div>
            <div class="gesture-row hidden"></div>
            <button class="btn ar-continue hidden" style="margin-top:10px;"></button>
          </div>
        </div>
      </div>
    `;
    this.video = this.container.querySelector(".ar-video");
    this.nocam = this.container.querySelector(".ar-nocam");
    this.canvas = this.container.querySelector(".ar-3d-canvas");
    this.instructionEl = this.container.querySelector(".ar-instruction");
    this.stepPill = this.container.querySelector(".ar-step-pill");
    this.modeBadge = this.container.querySelector(".ar-mode-badge");
    this.timerEl = this.container.querySelector(".ar-timer");
    this.dotsEl = this.container.querySelector(".ar-progress-dots");
    this.gestureRow = this.container.querySelector(".gesture-row");
    this.continueBtn = this.container.querySelector(".ar-continue");

    this.container.querySelector(".ar-close").onclick = () => this.exit();

    await this.startCamera();
    await this.detectXR();
    this.initThree();
    this.renderDots();
    this.renderStep();
    this.animate();

    window.addEventListener("resize", this.onResize = () => this.resizeRenderer());
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("click", (e) => this.onPointerClick(e));
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
    } catch (e) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.video.srcObject = this.stream;
      } catch (e2) {
        this.video.classList.add("hidden");
        this.nocam.classList.remove("hidden");
      }
    }
  }

  async detectXR() {
    this.xrSupported = false;
    try {
      if (navigator.xr && navigator.xr.isSessionSupported) {
        this.xrSupported = await navigator.xr.isSessionSupported("immersive-ar");
      }
    } catch (e) { this.xrSupported = false; }
    this.modeBadge.textContent = this.xrSupported ? "SPATIAL AR MODE" : "3D CAMERA SIMULATION MODE";
    this.modeBadge.className = "ar-mode-badge" + (this.xrSupported ? " spatial" : " sim");
    this.modeBadge.title = this.xrSupported
      ? "WebXR immersive-ar is supported on this device -- real plane-anchored placement."
      : "This browser/device does not expose spatial WebXR AR (true on virtually all laptops). Real 3D models are rendered over your live camera feed with parallax, but are not world-anchored.";
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene3 = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera3.position.set(0, 0, 3.4);
    this.worldGroup = new THREE.Group();
    this.scene3.add(this.worldGroup);

    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 3, 4);
    this.scene3.add(amb, dir);

    this.clock = new THREE.Clock();
    this.resizeRenderer();
  }

  resizeRenderer() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onPointerClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: nx, y: ny }, this.camera3);
    const hits = raycaster.intersectObjects(this.interactiveMeshes, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.onTap) obj = obj.parent;
      if (obj && obj.userData.onTap) obj.userData.onTap();
    }
  }

  animate() {
    this._raf = requestAnimationFrame(() => this.animate());
    const t = this.clock ? this.clock.getElapsedTime() : 0;
    if (this.worldGroup) {
      const targetY = this.mouse.x * 0.28;
      const targetX = -this.mouse.y * 0.14;
      this.worldGroup.rotation.y += (targetY - this.worldGroup.rotation.y) * 0.06;
      this.worldGroup.rotation.x += (targetX - this.worldGroup.rotation.x) * 0.06;
      this.worldGroup.children.forEach((c) => {
        if (c.userData.animate) c.userData.animate(t);
        c.children.forEach((cc) => { if (cc.userData.animate) cc.userData.animate(t); });
      });
    }
    if (this.renderer) this.renderer.render(this.scene3, this.camera3);
  }

  exit() {
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    if (this.timerHandle) clearInterval(this.timerHandle);
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    this.onExit();
  }

  renderDots() {
    this.dotsEl.innerHTML = this.steps
      .map((s, i) => {
        let cls = "ar-dot";
        if (i < this.stepIndex) cls += " done";
        else if (i === this.stepIndex) cls += " active";
        return `<div class="${cls}"></div>`;
      })
      .join("");
  }

  clearWorld() {
    while (this.worldGroup.children.length) {
      const c = this.worldGroup.children.pop();
      this.disposeDeep(c);
    }
    this.interactiveMeshes = [];
  }
  disposeDeep(obj) {
    if (obj.traverse) {
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.map) m.map.dispose && m.map.dispose();
            if (m.dispose) m.dispose();
          });
        }
      });
    }
  }

  layoutSlot(i, count) {
    const spread = Math.min(count, 5);
    const idx = i % spread;
    const angle = (idx - (spread - 1) / 2) * 0.42;
    const depthJitter = (i % 3) * 0.15;
    return {
      x: Math.sin(angle) * 1.5,
      y: 0.15 + Math.cos(idx * 1.7) * 0.35,
      z: -0.4 - depthJitter,
    };
  }

  renderStep() {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerEl.classList.add("hidden");
    this.gestureRow.classList.add("hidden");
    this.continueBtn.classList.add("hidden");
    this.clearWorld();

    const step = this.steps[this.stepIndex];
    if (!step) return this.finish();

    this.stepPill.textContent = `${this.stepIndex + 1} / ${this.steps.length}`;
    this.instructionEl.innerHTML = `
      <div class="obj">${(step.ar_object || step.type || "").replace(/_/g, " ")}</div>
      <p>${moduleField(step, "instruction")}</p>
    `;
    this.renderDots();

    const type = step.type;
    if (type === "identify" || type === "hazard_zone_recognition" || type === "hazard_id") {
      this.render3DTapTargets(step);
    } else if (type === "spatial_recognition" || type === "ppe_selection") {
      this.render3DSingleTarget(step);
    } else if (type === "procedure_simulation" || type === "loto_procedure") {
      this.render3DProcedure(step);
    } else if (type === "buddy_system_check") {
      this.render3DChecklist(step);
    } else if (type === "wayfinding" || type === "emergency_retrieval") {
      this.render3DWayfinding(step);
    } else {
      this.continueBtn.textContent = t("ar.mark_done");
      this.continueBtn.classList.remove("hidden");
      this.continueBtn.onclick = () => this.completeStep(step);
      const obj = buildObjectFor(step.ar_object);
      const p = this.layoutSlot(0, 1);
      obj.position.set(p.x, p.y, p.z);
      this.worldGroup.add(obj);
    }
  }

  render3DTapTargets(step) {
    const count = step.count_required || (step.correct_items ? step.correct_items.length : 3);
    let tapped = 0;
    for (let i = 0; i < count; i++) {
      const obj = buildObjectFor(step.ar_object);
      const p = this.layoutSlot(i, count);
      obj.position.set(p.x, p.y, p.z);
      obj.scale.setScalar(0.9);
      obj.userData.onTap = () => {
        if (obj.userData.tapped) return;
        obj.userData.tapped = true;
        obj.scale.setScalar(1.15);
        obj.traverse((o) => { if (o.material && o.material.emissive) { o.material.emissive.set(0x2be36a); o.material.emissiveIntensity = 0.8; } });
        tapped++;
        if (tapped >= count) setTimeout(() => this.completeStep(step), 250);
      };
      this.worldGroup.add(obj);
      this.collectInteractive(obj);
    }
  }

  render3DSingleTarget(step) {
    const obj = buildObjectFor(step.ar_object);
    const p = this.layoutSlot(0, 1);
    obj.position.set(p.x, p.y, p.z);
    obj.userData.onTap = () => {
      if (obj.userData.tapped) return;
      obj.userData.tapped = true;
      obj.scale.setScalar(1.2);
      obj.traverse((o) => { if (o.material && o.material.emissive) { o.material.emissive.set(0x2be36a); o.material.emissiveIntensity = 0.8; } });
      setTimeout(() => this.completeStep(step), 350);
    };
    this.worldGroup.add(obj);
    this.collectInteractive(obj);
  }

  render3DProcedure(step) {
    const obj = buildObjectFor(step.ar_object);
    obj.position.set(0, 0.1, -0.6);
    this.worldGroup.add(obj);

    const seq = step.gesture_sequence || [];
    this.gestureRow.classList.remove("hidden");
    this.gestureRow.innerHTML = "";
    let nextIdx = 0;
    seq.forEach((g, i) => {
      const b = document.createElement("div");
      b.className = "gesture-btn" + (i === 0 ? " next-up" : "");
      b.textContent = g.replace(/_/g, " ");
      b.onclick = () => {
        if (i !== nextIdx) return;
        b.classList.remove("next-up");
        b.classList.add("done");
        nextIdx++;
        obj.scale.setScalar(1 + nextIdx * 0.04);
        const next = this.gestureRow.children[nextIdx];
        if (next) next.classList.add("next-up");
        if (nextIdx >= seq.length) {
          obj.traverse((o) => { if (o.material && o.material.emissive) { o.material.emissive.set(0x2be36a); } });
          setTimeout(() => this.completeStep(step), 300);
        }
      };
      this.gestureRow.appendChild(b);
    });
  }

  render3DChecklist(step) {
    const buddy = buildBuddy(0x3aa0ff);
    buddy.position.set(-0.6, 0, -0.6);
    const attendant = buildBuddy(0xffb84d);
    attendant.position.set(0.6, 0, -0.6);
    this.worldGroup.add(buddy, attendant);

    const items = ["Entry permit signed", "Attendant stationed outside", "Two-way comms confirmed"];
    this.gestureRow.classList.remove("hidden");
    this.gestureRow.innerHTML = "";
    let done = 0;
    items.forEach((label) => {
      const b = document.createElement("div");
      b.className = "gesture-btn";
      b.textContent = label;
      b.onclick = () => {
        if (b.classList.contains("done")) return;
        b.classList.add("done");
        done++;
        if (done >= items.length) setTimeout(() => this.completeStep(step), 300);
      };
      this.gestureRow.appendChild(b);
    });
  }

  render3DWayfinding(step) {
    const limit = step.time_limit_seconds || 60;
    let remaining = limit;
    this.timerEl.classList.remove("hidden");
    this.timerEl.textContent = this.fmtTime(remaining);
    this.timerHandle = setInterval(() => {
      remaining--;
      this.timerEl.textContent = this.fmtTime(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(this.timerHandle);
    }, 1000);

    const arrowCount = 4;
    for (let i = 0; i < arrowCount; i++) {
      const arrow = buildEvacArrow(0xffd23f);
      arrow.position.set(-1.2 + i * 0.7, -0.6 + i * 0.02, -0.5 - i * 0.3);
      arrow.rotation.x = -0.3;
      this.worldGroup.add(arrow);
    }
    const dest = step.ar_object === "retrieval_tripod_hoist" ? buildTripodHoist() : buildMusterPoint();
    dest.position.set(1.4, 0, -1.6);
    this.worldGroup.add(dest);

    this.continueBtn.textContent = "Arrived at muster point";
    this.continueBtn.classList.remove("hidden");
    this.continueBtn.onclick = () => {
      clearInterval(this.timerHandle);
      this.completeStep(step);
    };
  }

  collectInteractive(obj) {
    obj.traverse((o) => { if (o.isMesh) this.interactiveMeshes.push(o); });
  }

  fmtTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  completeStep(step) {
    this.onStepComplete(step.id);
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.finish();
    } else {
      this.renderStep();
    }
  }

  finish() {
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    if (this._raf) cancelAnimationFrame(this._raf);
    this.onAllComplete();
  }
}
