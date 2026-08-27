"""
db.py - SQLite persistence layer (stdlib sqlite3, zero external deps).
In production this maps 1:1 onto Postgres (see schema.sql notes) - SQLite is
used here purely so the whole backend runs anywhere with no setup.
"""
import sqlite3
import json
import os
import time
import uuid

DB_PATH = os.path.join(os.path.dirname(__file__), "suraksha_ar.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    sector TEXT NOT NULL,          -- mining | steel | mica
    site TEXT,
    language TEXT DEFAULT 'hi',    -- hi | en | sat (Santhali)
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title_en TEXT NOT NULL,
    title_hi TEXT NOT NULL,
    domain TEXT NOT NULL,          -- fire | gas | machinery | electrical | mica_dust
    sector_tags TEXT NOT NULL,     -- json list
    pass_score INT DEFAULT 80,
    ar_scene_json TEXT NOT NULL,   -- AR hotspot/object graph the app renders
    version INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES modules(id),
    prompt_en TEXT NOT NULL,
    prompt_hi TEXT NOT NULL,
    options_json TEXT NOT NULL,    -- json list of {id, text_en, text_hi}
    correct_option TEXT NOT NULL,
    weight INT DEFAULT 1,
    ar_step_ref TEXT               -- which AR step this question checks
);

CREATE TABLE IF NOT EXISTS progress (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL REFERENCES workers(id),
    module_id TEXT NOT NULL REFERENCES modules(id),
    status TEXT NOT NULL,          -- started | ar_completed | assessed | certified
    ar_steps_completed TEXT,       -- json list of step ids completed in AR
    time_spent_seconds INT DEFAULT 0,
    updated_at REAL NOT NULL,
    UNIQUE(worker_id, module_id)
);

CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL REFERENCES workers(id),
    module_id TEXT NOT NULL REFERENCES modules(id),
    answers_json TEXT NOT NULL,
    score INT NOT NULL,
    passed INTEGER NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,     -- short human/QR code e.g. SAR-8F3K9Q
    worker_id TEXT NOT NULL REFERENCES workers(id),
    module_id TEXT NOT NULL REFERENCES modules(id),
    attempt_id TEXT NOT NULL REFERENCES attempts(id),
    issued_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    revoked INTEGER DEFAULT 0
);
"""


def init_db(reset=False):
    if reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    seed_modules(conn)
    conn.close()


def _mod_exists(conn, code):
    return conn.execute("SELECT 1 FROM modules WHERE code=?", (code,)).fetchone()


def seed_modules(conn):
    if _mod_exists(conn, "FIRE-01"):
        return

    # ---- Module 1: Fire & Explosion Response ----
    fire_scene = {
        "environment": "generic_industrial_floor",
        "anchors": "plane_detection",  # ARCore horizontal+vertical plane detection
        "steps": [
            {
                "id": "fire_s1", "type": "identify",
                "instruction_en": "Look around the room. Tap the two nearest emergency EXIT signs.",
                "instruction_hi": "\u0915\u092e\u0930\u0947 \u092e\u0947\u0902 \u0926\u0947\u0916\u0947\u0902\u0964 \u0926\u094b \u0928\u093f\u0915\u091f\u0924\u092e EXIT \u0938\u093e\u0907\u0928 \u092a\u0930 \u091f\u0948\u092a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "exit_sign_marker", "count_required": 2
            },
            {
                "id": "fire_s2", "type": "spatial_recognition",
                "instruction_en": "Point your camera at a fire extinguisher point. The app will overlay a PASS/FAIL check on extinguisher type vs the simulated fire class.",
                "instruction_hi": "\u0905\u0917\u094d\u0928\u093f\u0936\u093e\u092e\u0915 \u092f\u0902\u0924\u094d\u0930 \u0915\u0940 \u0913\u0930 \u0915\u0948\u092e\u0930\u093e \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "extinguisher_type_check"
            },
            {
                "id": "fire_s3", "type": "procedure_simulation",
                "instruction_en": "Simulated Class-B fire appears via AR overlay. Perform PASS: Pull, Aim, Squeeze, Sweep using on-screen gesture prompts.",
                "instruction_hi": "PASS \u0935\u093f\u0927\u093f \u0915\u093e \u092a\u094d\u0930\u092f\u094b\u0917 \u0915\u0930\u0947\u0902: Pull, Aim, Squeeze, Sweep\u0964",
                "ar_object": "simulated_fire_particle_system", "gesture_sequence": ["pull_pin", "aim_low", "squeeze_handle", "sweep_side_to_side"]
            },
            {
                "id": "fire_s4", "type": "wayfinding",
                "instruction_en": "Follow the AR floor-path arrows to the nearest muster/assembly point within the time limit.",
                "instruction_hi": "AR \u0924\u0940\u0930 \u0905\u0930\u0930 \u0915\u093e \u0905\u0928\u0941\u0938\u0930\u0923 \u0915\u0930\u0924\u0947 \u0939\u0941\u090f \u0938\u092c\u0938\u0947 \u0928\u091c\u0926\u0940\u0915 \u092e\u0938\u094d\u091f\u0930 \u092a\u0949\u0907\u0902\u091f \u0924\u0915 \u091c\u093e\u090f\u0902\u0964",
                "ar_object": "floor_path_arrows", "time_limit_seconds": 90
            }
        ]
    }

    # ---- Module 2: Gas Leak & Confined Space Protocol ----
    gas_scene = {
        "environment": "confined_space_shaft",
        "anchors": "plane_detection",
        "steps": [
            {
                "id": "gas_s1", "type": "hazard_zone_recognition",
                "instruction_en": "AR overlay shows a simulated gas concentration heat-map on real surfaces. Tap all zones above safe LEL threshold.",
                "instruction_hi": "\u0938\u093f\u092e\u0941\u0932\u0947\u091f\u0947\u0921 \u0917\u0948\u0938 \u0938\u093e\u0902\u0926\u094d\u0930\u0924\u093e \u0939\u0940\u091f\u092e\u0948\u092a \u092a\u0930 \u0916\u0924\u0930\u0928\u093e\u0915 \u091c\u094b\u0928 \u091f\u0948\u092a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "gas_heatmap_overlay"
            },
            {
                "id": "gas_s2", "type": "ppe_selection",
                "instruction_en": "From the AR inventory shelf, drag the correct PPE set (SCBA, gas detector, harness) onto the avatar before entry.",
                "instruction_hi": "\u0938\u0939\u0940 PPE \u0938\u0947\u091f \u091a\u0941\u0928\u0947\u0902 \u0914\u0930 \u0905\u0935\u0924\u093e\u0930 \u092a\u0930 \u0932\u0917\u093e\u090f\u0902\u0964",
                "ar_object": "ppe_inventory_shelf", "correct_items": ["scba", "gas_detector", "safety_harness", "comms_radio"]
            },
            {
                "id": "gas_s3", "type": "buddy_system_check",
                "instruction_en": "AR shows a virtual buddy and attendant. Complete the entry-permit checklist and confirm two-way comms before 'entering' the confined space.",
                "instruction_hi": "\u092c\u0921\u0940-\u0938\u093f\u0938\u094d\u091f\u092e \u091a\u0947\u0915\u0932\u093f\u0938\u094d\u091f \u092a\u0942\u0930\u0940 \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "buddy_avatar_checklist"
            },
            {
                "id": "gas_s4", "type": "emergency_retrieval",
                "instruction_en": "Simulated gas-alarm triggers. Execute the non-entry retrieval procedure using the AR-highlighted retrieval line and tripod hoist.",
                "instruction_hi": "\u0906\u092a\u093e\u0924\u0915\u093e\u0932\u0940\u0928 \u0930\u093f\u091f\u094d\u0930\u0940\u0935\u0932 \u092a\u094d\u0930\u0915\u094d\u0930\u093f\u092f\u093e \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "retrieval_tripod_hoist", "time_limit_seconds": 60
            }
        ]
    }

    # ---- Module 3: Machinery / LOTO ----
    machinery_scene = {
        "environment": "generic_industrial_floor",
        "anchors": "plane_detection",
        "steps": [
            {
                "id": "mach_s1", "type": "hazard_id",
                "instruction_en": "Tap all pinch-point and rotating-part hazards highlighted by AR bounding boxes on the machine.",
                "instruction_hi": "\u092e\u0936\u0940\u0928 \u092a\u0930 \u0916\u0924\u0930\u0947 \u0915\u0947 \u092c\u093f\u0902\u0926\u0941 \u091f\u0948\u092a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "hazard_bounding_boxes"
            },
            {
                "id": "mach_s2", "type": "loto_procedure",
                "instruction_en": "Perform Lockout-Tagout in AR: isolate energy source, apply lock, apply tag, verify zero-energy state.",
                "instruction_hi": "\u0932\u0949\u0915\u0906\u0909\u091f-\u091f\u0948\u0917\u0906\u0909\u091f \u092a\u094d\u0930\u0915\u094d\u0930\u093f\u092f\u093e \u092a\u0942\u0930\u0940 \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "loto_lock_tag_kit", "gesture_sequence": ["isolate_energy", "apply_lock", "apply_tag", "verify_zero_energy"]
            }
        ]
    }

    # ---- Module 4: Electrical Safety ----
    electrical_scene = {
        "environment": "generic_industrial_floor",
        "anchors": "plane_detection",
        "steps": [
            {
                "id": "elec_s1", "type": "hazard_id",
                "instruction_en": "Tap the AR-highlighted high-voltage panel and arc-flash hazard zones before approaching.",
                "instruction_hi": "\u0928\u091c\u0926\u0940\u0915 \u0906\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0939\u093e\u0908-\u0935\u094b\u0932\u094d\u091f\u0947\u091c \u092a\u0948\u0928\u0932 \u0914\u0930 \u0906\u0930\u094d\u0915-\u092b\u094d\u0932\u0948\u0936 \u091c\u094b\u0928 \u0915\u094b \u091f\u0948\u092a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "electrical_panel", "count_required": 2
            },
            {
                "id": "elec_s2", "type": "ppe_selection",
                "instruction_en": "Select and put on insulated gloves rated for the panel's voltage class before any contact.",
                "instruction_hi": "\u0915\u093f\u0938\u0940 \u092d\u0940 \u0938\u0902\u092a\u0930\u094d\u0915 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0938\u0939\u0940 \u0935\u094b\u0932\u094d\u091f\u0947\u091c \u0930\u0947\u091f\u093f\u0902\u0917 \u0935\u093e\u0932\u0947 \u0907\u0928\u094d\u0938\u0941\u0932\u0947\u091f\u0947\u0921 \u0917\u094d\u0932\u0935\u094d\u0938 \u092a\u0939\u0928\u0947\u0902\u0964",
                "ar_object": "insulated_gloves"
            },
            {
                "id": "elec_s3", "type": "procedure_simulation",
                "instruction_en": "Perform Lockout-Tagout on the panel and verify zero voltage with a non-contact tester before work.",
                "instruction_hi": "\u092a\u0948\u0928\u0932 \u092a\u0930 \u0932\u0949\u0915\u0906\u0909\u091f-\u091f\u0948\u0917\u0906\u0909\u091f \u0915\u0930\u0947\u0902 \u0914\u0930 \u0935\u094b\u0932\u094d\u091f\u0947\u091c \u091f\u0947\u0938\u094d\u091f\u0930 \u0938\u0947 \u091c\u093c\u0940\u0930\u094b \u0935\u094b\u0932\u094d\u091f\u0947\u091c \u0915\u0940 \u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "voltage_tester", "gesture_sequence": ["isolate_supply", "apply_lock", "apply_tag", "test_for_zero_voltage"]
            },
            {
                "id": "elec_s4", "type": "identify",
                "instruction_en": "Identify the arc-flash boundary markers and confirm safe working distance.",
                "instruction_hi": "\u0906\u0930\u094d\u0915-\u092b\u094d\u0932\u0948\u0936 \u092c\u093e\u0909\u0902\u0921\u0930\u0940 \u092e\u093e\u0930\u094d\u0915\u0930 \u092a\u0939\u091a\u093e\u0928\u0947\u0902 \u0914\u0930 \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u0926\u0942\u0930\u0940 \u0938\u0941\u0928\u093f\u0936\u094d\u091a\u093f\u0924 \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "arc_flash_warning", "count_required": 1
            }
        ]
    }

    # ---- Module 5: Dust / Mica Occupational Safety ----
    dust_scene = {
        "environment": "mica_extraction_floor",
        "anchors": "plane_detection",
        "steps": [
            {
                "id": "dust_s1", "type": "hazard_zone_recognition",
                "instruction_en": "AR shows an airborne dust concentration cloud around active drilling. Tap all zones exceeding safe exposure limits.",
                "instruction_hi": "\u0938\u0915\u094d\u0930\u093f\u092f \u0921\u094d\u0930\u093f\u0932\u093f\u0902\u0917 \u0915\u0947 \u0906\u0938\u092a\u093e\u0938 \u0927\u0942\u0932 \u0915\u0947 \u091c\u094b\u0928 \u091f\u0948\u092a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "dust_cloud", "count_required": 2
            },
            {
                "id": "dust_s2", "type": "ppe_selection",
                "instruction_en": "Fit the correct respiratory protection (respirator mask) before entering the dust zone.",
                "instruction_hi": "\u0927\u0942\u0932 \u0915\u094d\u0937\u0947\u0924\u094d\u0930 \u092e\u0947\u0902 \u092a\u094d\u0930\u0935\u0947\u0936 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0938\u0939\u0940 \u0936\u094d\u0935\u0938\u0928 \u0938\u0941\u0930\u0915\u094d\u0937\u093e (\u0930\u0947\u0938\u094d\u092a\u093f\u0930\u0947\u091f\u0930) \u092a\u0939\u0928\u0947\u0902\u0964",
                "ar_object": "respirator_mask"
            },
            {
                "id": "dust_s3", "type": "identify",
                "instruction_en": "Identify the mica extraction drill and confirm the wet-suppression/dust-collection system is running.",
                "instruction_hi": "\u092e\u093e\u0907\u0915\u093e \u0921\u094d\u0930\u093f\u0932 \u092a\u0939\u091a\u093e\u0928\u0947\u0902 \u0914\u0930 \u0927\u0942\u0932 \u0928\u093f\u092f\u0902\u0924\u094d\u0930\u0923 \u092a\u094d\u0930\u0923\u093e\u0932\u0940 \u0915\u0940 \u091c\u093e\u0902\u091a \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "mica_drill", "count_required": 1
            },
            {
                "id": "dust_s4", "type": "buddy_system_check",
                "instruction_en": "Complete the periodic health-monitoring / exposure checklist with your shift supervisor before continuing work.",
                "instruction_hi": "\u0915\u093e\u092e \u091c\u093e\u0930\u0940 \u0930\u0916\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0938\u094d\u0935\u093e\u0938\u094d\u0925\u094d\u092f \u0928\u093f\u0917\u0930\u093e\u0928\u0940 \u091a\u0947\u0915\u0932\u093f\u0938\u094d\u091f \u092a\u0942\u0930\u093e \u0915\u0930\u0947\u0902\u0964",
                "ar_object": "buddy_avatar_checklist"
            }
        ]
    }

    modules = [
        ("FIRE-01", "Fire & Explosion Response", "\u0905\u0917\u094d\u0928\u093f \u090f\u0935\u0902 \u0935\u093f\u0938\u094d\u092b\u094b\u091f \u092a\u094d\u0930\u0924\u093f\u0915\u094d\u0930\u093f\u092f\u093e", "fire",
         ["mining", "steel", "mica"], fire_scene),
        ("GAS-01", "Gas Leak & Confined Space Protocol", "\u0917\u0948\u0938 \u0930\u093f\u0938\u093e\u0935 \u090f\u0935\u0902 \u0938\u0940\u092e\u093f\u0924 \u0938\u094d\u0925\u093e\u0928 \u092a\u094d\u0930\u094b\u091f\u094b\u0915\u0949\u0932", "gas",
         ["mining", "steel"], gas_scene),
        ("MACH-01", "Machinery Guarding & LOTO", "\u092e\u0936\u0940\u0928\u0930\u0940 \u0938\u0941\u0930\u0915\u094d\u0937\u093e \u090f\u0935\u0902 LOTO", "machinery",
         ["steel", "mica", "mining"], machinery_scene),
        ("ELEC-01", "Electrical Safety", "\u0935\u093f\u0926\u094d\u092f\u0941\u0924 \u0938\u0941\u0930\u0915\u094d\u0937\u093e", "electrical",
         ["steel", "mining", "mica"], electrical_scene),
        ("DUST-01", "Dust / Mica Occupational Safety", "\u0927\u0942\u0932 / \u092e\u093e\u0907\u0915\u093e \u0935\u094d\u092f\u093e\u0935\u0938\u093e\u092f\u093f\u0915 \u0938\u0941\u0930\u0915\u094d\u0937\u093e", "mica_dust",
         ["mica", "mining"], dust_scene),
    ]

    questions_by_code = {
        "FIRE-01": [
            ("Which fire class involves flammable liquids?", "\u0915\u094c\u0928 \u0938\u0940 \u0906\u0917 \u0936\u094d\u0930\u0947\u0923\u0940 \u091c\u094d\u0935\u0932\u0928\u0936\u0940\u0932 \u0924\u0930\u0932 \u092a\u0926\u093e\u0930\u094d\u0925\u094b\u0902 \u0938\u0947 \u0938\u0902\u092c\u0902\u0927\u093f\u0924 \u0939\u0948?",
             [("a", "Class A"), ("b", "Class B"), ("c", "Class C"), ("d", "Class D")], "b"),
            ("What is the correct PASS sequence for a fire extinguisher?", "\u0905\u0917\u094d\u0928\u093f\u0936\u093e\u092e\u0915 \u092f\u0902\u0924\u094d\u0930 \u0915\u0947 \u0932\u093f\u090f \u0938\u0939\u0940 PASS \u0915\u094d\u0930\u092e \u0915\u094d\u092f\u093e \u0939\u0948?",
             [("a", "Aim, Pull, Sweep, Squeeze"), ("b", "Pull, Aim, Squeeze, Sweep"),
              ("c", "Squeeze, Pull, Aim, Sweep"), ("d", "Sweep, Squeeze, Pull, Aim")], "b"),
            ("During evacuation you should:", "\u0928\u093f\u0915\u093e\u0938\u0940 \u0915\u0947 \u0926\u094c\u0930\u093e\u0928 \u0906\u092a\u0915\u094b \u0915\u094d\u092f\u093e \u0915\u0930\u0928\u093e \u091a\u093e\u0939\u093f\u090f?",
             [("a", "Use elevators to save time"), ("b", "Run back for personal belongings"),
              ("c", "Use stairs and go to the muster point"), ("d", "Wait inside until smoke clears")], "c"),
        ],
        "GAS-01": [
            ("LEL stands for:", "LEL \u0915\u093e \u092a\u0942\u0930\u093e \u0928\u093e\u092e \u0915\u094d\u092f\u093e \u0939\u0948?",
             [("a", "Lower Explosive Limit"), ("b", "Lowest Emergency Level"),
              ("c", "Local Exhaust Line"), ("d", "Limited Entry Level")], "a"),
            ("Before entering a confined space you must:", "\u0938\u0940\u092e\u093f\u0924 \u0938\u094d\u0925\u093e\u0928 \u092e\u0947\u0902 \u092a\u094d\u0930\u0935\u0947\u0936 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0906\u092a\u0915\u094b \u0915\u094d\u092f\u093e \u0915\u0930\u0928\u093e \u091a\u093e\u0939\u093f\u090f?",
             [("a", "Enter quickly to save time"), ("b", "Obtain an entry permit & test the atmosphere"),
              ("c", "Remove your PPE for comfort"), ("d", "Work alone to avoid crowding")], "b"),
            ("The buddy system requires:", "\u092c\u0921\u0940-\u0938\u093f\u0938\u094d\u091f\u092e \u092e\u0947\u0902 \u0915\u094d\u092f\u093e \u0906\u0935\u0936\u094d\u092f\u0915 \u0939\u0948?",
             [("a", "One worker inside, no one outside"), ("b", "An attendant stationed outside with two-way comms"),
              ("c", "A supervisor's approval only, no attendant"), ("d", "GPS tracking only")], "b"),
        ],
        "MACH-01": [
            ("The first step of LOTO is:", "LOTO \u0915\u093e \u092a\u0939\u0932\u093e \u091a\u0930\u0923 \u0915\u094d\u092f\u093e \u0939\u0948?",
             [("a", "Apply the tag"), ("b", "Notify affected employees & isolate energy sources"),
              ("c", "Restart the machine"), ("d", "Remove the lock")], "b"),
            ("Zero-energy state must be verified by:", "\u0936\u0942\u0928\u094d\u092f-\u090a\u0930\u094d\u091c\u093e \u0938\u094d\u0925\u093f\u0924\u093f \u0915\u0940 \u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0948\u0938\u0947 \u0915\u0930\u0947\u0902?",
             [("a", "Visual check only"), ("b", "Attempting to start the equipment after lockout"),
              ("c", "Asking a coworker"), ("d", "Reading the manual")], "b"),
        ],
        "ELEC-01": [
            ("Before working on any electrical panel you must:", "\u0915\u093f\u0938\u0940 \u092d\u0940 \u0935\u093f\u0926\u094d\u092f\u0941\u0924 \u092a\u0948\u0928\u0932 \u092a\u0930 \u0915\u093e\u092e \u0915\u0930\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0906\u092a\u0915\u094b \u0915\u094d\u092f\u093e \u0915\u0930\u0928\u093e \u091a\u093e\u0939\u093f\u090f?",
             [("a", "Assume it is off"), ("b", "Lockout-tagout and verify zero voltage with a tester"),
              ("c", "Wear cotton gloves only"), ("d", "Work quickly to finish faster")], "b"),
            ("Insulated gloves must be:", "\u0907\u0928\u094d\u0938\u0941\u0932\u0947\u091f\u0947\u0921 \u0917\u094d\u0932\u0935\u094d\u0938 \u0915\u0948\u0938\u0940 \u0939\u094b\u0928\u0940 \u091a\u093e\u0939\u093f\u090f?",
             [("a", "Any thick fabric glove"), ("b", "Rated for the voltage class being worked on"),
              ("c", "Borrowed from another site"), ("d", "Optional if you work fast")], "b"),
            ("An arc-flash boundary marks:", "\u0906\u0930\u094d\u0915-\u092b\u094d\u0932\u0948\u0936 \u092c\u093e\u0909\u0902\u0921\u0930\u0940 \u0915\u094d\u092f\u093e \u0926\u0930\u094d\u0936\u093e\u0924\u0940 \u0939\u0948?",
             [("a", "The nearest exit"), ("b", "The minimum safe approach distance from an arc-flash hazard"),
              ("c", "A parking zone"), ("d", "A no-smoking area")], "b"),
        ],
        "DUST-01": [
            ("The main long-term health risk from mica/silica dust exposure is:", "\u092e\u093e\u0907\u0915\u093e/\u0938\u093f\u0932\u093f\u0915\u093e \u0927\u0942\u0932 \u0938\u0947 \u092e\u0941\u0916\u094d\u092f \u0926\u0940\u0930\u094d\u0918\u0915\u093e\u0932\u093f\u0915 \u0938\u094d\u0935\u093e\u0938\u094d\u0925\u094d\u092f \u091c\u094b\u0916\u093f\u092e \u0915\u094d\u092f\u093e \u0939\u0948?",
             [("a", "Skin tanning"), ("b", "Respiratory disease (e.g. silicosis)"),
              ("c", "Hearing loss"), ("d", "Improved lung capacity")], "b"),
            ("Before entering a high-dust zone a worker should:", "\u0909\u091a\u094d\u091a-\u0927\u0942\u0932 \u091c\u094b\u0928 \u092e\u0947\u0902 \u092a\u094d\u0930\u0935\u0947\u0936 \u0938\u0947 \u092a\u0939\u0932\u0947 \u092e\u091c\u0926\u0942\u0930 \u0915\u094b \u0915\u094d\u092f\u093e \u0915\u0930\u0928\u093e \u091a\u093e\u0939\u093f\u090f?",
             [("a", "Hold their breath"), ("b", "Fit a proper respirator/mask rated for the dust type"),
              ("c", "Nothing, dust is harmless"), ("d", "Wear sunglasses only")], "b"),
            ("Wet-suppression / dust-collection systems at a drill are used to:", "\u0921\u094d\u0930\u093f\u0932 \u092a\u0930 \u0935\u0947\u091f-\u0938\u092a\u094d\u0930\u0947\u0936\u0928 \u092a\u094d\u0930\u0923\u093e\u0932\u0940 \u0915\u093e \u0909\u0926\u094d\u0926\u0947\u0936\u094d\u092f \u0915\u094d\u092f\u093e \u0939\u0948?",
             [("a", "Cool the drill motor only"), ("b", "Reduce airborne dust at the source"),
              ("c", "Speed up drilling"), ("d", "Clean the operator's hands")], "b"),
        ],
    }

    for code, t_en, t_hi, domain, sectors, scene in modules:
        mid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO modules (id, code, title_en, title_hi, domain, sector_tags, pass_score, ar_scene_json, version) VALUES (?,?,?,?,?,?,?,?,1)",
            (mid, code, t_en, t_hi, domain, json.dumps(sectors), 80, json.dumps(scene))
        )
        for prompt_en, prompt_hi, opts, correct in questions_by_code[code]:
            qid = str(uuid.uuid4())
            options = [{"id": oid, "text_en": txt, "text_hi": txt} for oid, txt in opts]
            conn.execute(
                "INSERT INTO questions (id, module_id, prompt_en, prompt_hi, options_json, correct_option, weight) VALUES (?,?,?,?,?,?,1)",
                (qid, mid, prompt_en, prompt_hi, json.dumps(options), correct)
            )
    conn.commit()
