import os
from PIL import Image, ImageDraw, ImageFont

output_dir = r"C:\Users\nandi\.gemini\antigravity\brain\44075c0c-6864-44d9-a9be-131d093667bc"
os.makedirs(output_dir, exist_ok=True)
gif_path = os.path.join(output_dir, "mongotrace_execution_demo.gif")

width, height = 800, 460

# Stages definition
stages = [
    {"name": "1. INGESTION", "sub": "Raw JSON / CSV / Syslog", "color": "#38bdf8"},
    {"name": "2. SHA-256 HASH", "sub": "Canonical Ledger", "color": "#34d399"},
    {"name": "3. FASTAPI ML", "sub": "Isolation Forest (5055)", "color": "#f59e0b"},
    {"name": "4. MITRE RULES", "sub": "T1048 Exfiltration", "color": "#ec4899"},
    {"name": "5. MONGODB", "sub": "BSON + GridFS (27017)", "color": "#10b981"},
    {"name": "6. FORENSICS", "sub": "D3 Graph & Timeline", "color": "#6366f1"},
]

logs_per_stage = [
    [
        "> [INGESTION] Received telemetry batch from endpoint: ws-eng-88.corp.lan",
        "> Ingesting 7z.exe archive clone event (85 MB payload over port 4444)...",
        "> RFC-4180 parsing verified. Batch job tracking ID: JOB-2026-962"
    ],
    [
        "> [SHA-256 LEDGER] Sorting JSON payload keys canonically...",
        "> Computing deterministic SHA-256 genesis hash...",
        "> Genesis Signature: 92007f4ff1b0fc5e76c1bd0e43f2c3f0c01d666ea0167825082d4f1034873b31"
    ],
    [
        "> [FASTAPI ML] HTTP POST http://127.0.0.1:5055/predict",
        "> Extracted 9 features: duration=180s, src_bytes=85MB, is_lotl=1, port=4444",
        "> Isolation Forest (150 trees) -> Anomaly Score: 0.7332 (CRITICAL ANOMALY)"
    ],
    [
        "> [DETECTION RULES] Correlating event against MITRE ATT&CK framework...",
        "> Rule Triggered: Rapid Threat Burst + Exfiltration to External Endpoint",
        "> MITRE Technique: T1048 (Exfiltration Over Alternative Protocol)"
    ],
    [
        "> [NoSQL PERSISTENCE] Committing to MongoDB v8.2.0 (WiredTiger)...",
        "> Ingested into 'evidence', 'ml_detections', & 'evidence_versions' (v1)",
        "> Appended immutable audit log into 'audit_logs'. GridFS binary chunked."
    ],
    [
        "> [OUTPUT DISPATCH] Emitting SSE real-time telemetry to client...",
        "> D3.js Knowledge Graph updated: 7 nodes, 6 polymorphic relationships.",
        "> Interactive Timeline populated. Investigation Dossier generated!"
    ]
]

frames = []

# Generate frames for 6 stages, with transition animation
for stage_idx in range(len(stages)):
    current_stage = stages[stage_idx]
    
    # 5 frames per stage
    for sub_frame in range(6):
        img = Image.new("RGB", (width, height), color="#0f172a")
        draw = ImageDraw.Draw(img)
        
        # Header
        draw.rectangle([0, 0, width, 50], fill="#1e293b")
        draw.text((20, 15), "MongoTrace Forensic Execution Pipeline - Live Execution Walkthrough", fill="#f8fafc")
        draw.text((640, 15), f"STAGE {stage_idx + 1} OF 6", fill="#38bdf8")
        draw.line([0, 50, width, 50], fill="#334155", width=2)
        
        # Draw stages boxes
        box_w = 110
        box_h = 75
        gap = 18
        start_x = 20
        y = 75
        
        for i, s in enumerate(stages):
            bx = start_x + i * (box_w + gap)
            is_active = (i == stage_idx)
            is_done = (i < stage_idx)
            
            # Box border and fill
            if is_active:
                border_color = s["color"]
                bg_color = "#1e293b"
                draw.rectangle([bx-2, y-2, bx+box_w+2, y+box_h+2], outline=border_color, width=3)
            elif is_done:
                border_color = "#10b981"
                bg_color = "#092e20"
                draw.rectangle([bx, y, bx+box_w, y+box_h], fill=bg_color, outline=border_color, width=1)
            else:
                border_color = "#334155"
                bg_color = "#1e293b"
                draw.rectangle([bx, y, bx+box_w, y+box_h], fill=bg_color, outline=border_color, width=1)
                
            draw.text((bx + 8, y + 12), s["name"], fill="#ffffff" if is_active else ("#94a3b8" if not is_done else "#34d399"))
            draw.text((bx + 8, y + 36), s["sub"][:16], fill="#94a3b8")
            draw.text((bx + 8, y + 50), s["sub"][16:32], fill="#64748b")
            
            # Connector arrow
            if i < len(stages) - 1:
                cx = bx + box_w + 3
                cy = y + box_h // 2
                arrow_color = "#38bdf8" if (i == stage_idx and sub_frame >= 3) or is_done else "#475569"
                draw.line([cx, cy, cx + gap - 6, cy], fill=arrow_color, width=2)
                draw.polygon([(cx + gap - 6, cy - 4), (cx + gap - 2, cy), (cx + gap - 6, cy + 4)], fill=arrow_color)

        # Pulse animation between active stage and next
        if stage_idx < len(stages) - 1:
            pulse_x = start_x + stage_idx * (box_w + gap) + box_w + int((sub_frame / 6.0) * gap)
            pulse_y = y + box_h // 2
            draw.ellipse([pulse_x - 3, pulse_y - 3, pulse_x + 3, pulse_y + 3], fill="#38bdf8")

        # Terminal / Inspection Window
        term_y = 175
        term_h = 240
        draw.rectangle([20, term_y, width - 20, term_y + term_h], fill="#020617", outline="#334155", width=2)
        draw.rectangle([20, term_y, width - 20, term_y + 30], fill="#0f172a")
        draw.ellipse([32, term_y + 10, 42, term_y + 20], fill="#ef4444")
        draw.ellipse([48, term_y + 10, 58, term_y + 20], fill="#f59e0b")
        draw.ellipse([64, term_y + 10, 74, term_y + 20], fill="#10b981")
        draw.text((90, term_y + 8), f"TELEMETRY INSPECTION CONSOLE - {current_stage['name']}", fill="#cbd5e1")
        
        # Log lines
        lines = logs_per_stage[stage_idx]
        for line_num, log_text in enumerate(lines):
            line_y = term_y + 45 + (line_num * 30)
            if line_num == 0:
                color = "#38bdf8"
            elif "CRITICAL" in log_text or "T1048" in log_text:
                color = "#f43f5e"
            elif "SHA-256" in log_text or "9200" in log_text or "Isolation" in log_text:
                color = "#fbbf24"
            elif "MongoDB" in log_text or "verified" in log_text or "updated" in log_text:
                color = "#4ade80"
            else:
                color = "#e2e8f0"
            draw.text((35, line_y), log_text, fill=color)

        # Bottom stats bar
        stat_y = term_y + 155
        draw.line([35, stat_y, width - 35, stat_y], fill="#1e293b", width=1)
        draw.text((35, stat_y + 10), "Status: ACTIVE PIPELINE", fill="#10b981")
        draw.text((220, stat_y + 10), "Anomaly Score: 0.7332 (HIGH)", fill="#f43f5e")
        draw.text((450, stat_y + 10), "Database: mongotrace", fill="#94a3b8")
        draw.text((630, stat_y + 10), "Cluster: Port 5050 / 5055", fill="#94a3b8")

        # Bottom Scrubber / Timeline bar
        progress_pct = (stage_idx * 6 + sub_frame) / float(len(stages) * 6)
        draw.rectangle([0, height - 10, width, height], fill="#1e293b")
        draw.rectangle([0, height - 10, int(width * progress_pct), height], fill="#38bdf8")

        frames.append(img)

# Save as optimized GIF (each frame lasts 400ms)
frames[0].save(
    gif_path,
    save_all=True,
    append_images=frames[1:],
    optimize=True,
    duration=380,
    loop=0
)
print("SUCCESS: Saved animated GIF to", gif_path)

