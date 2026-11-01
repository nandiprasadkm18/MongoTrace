with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add nav-ml in sidebar navigation right after nav-evidence
nav_evidence_marker = """        <button class="nav-item" data-tab="tab-evidence" id="nav-evidence">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span>Evidence Explorer</span>
        </button>"""

nav_ml_item = """        <button class="nav-item" data-tab="tab-evidence" id="nav-evidence">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span>Evidence Explorer</span>
        </button>

        <button class="nav-item" data-tab="tab-ml" id="nav-ml">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>ML Detections</span>
        </button>"""

if nav_evidence_marker in content:
    content = content.replace(nav_evidence_marker, nav_ml_item, 1)

# 2. Add ML section in tab-overview right after KPI grid
kpi_grid_end = """            <div class="kpi-card">
              <span class="kpi-label">INTEGRITY STATUS</span>
              <div class="kpi-val-row">
                <span class="kpi-value text-emerald" id="kpiIntegrityStatus">VERIFIED</span>
                <span class="kpi-subtag">SHA-256 Ledger</span>
              </div>
            </div>
          </div>"""

ml_overview_strip = """            <div class="kpi-card">
              <span class="kpi-label">INTEGRITY STATUS</span>
              <div class="kpi-val-row">
                <span class="kpi-value text-emerald" id="kpiIntegrityStatus">VERIFIED</span>
                <span class="kpi-subtag">SHA-256 Ledger</span>
              </div>
            </div>
          </div>

          <!-- Machine Learning Anomaly Detection Engine Strip -->
          <div class="clean-card mt-3" style="background: linear-gradient(135deg, rgba(0, 104, 74, 0.03) 0%, rgba(37, 99, 235, 0.03) 100%); border-left: 4px solid var(--mongo-green);">
            <div class="card-head-row">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="live-dot" style="background: var(--mongo-leaf); box-shadow: 0 0 6px var(--mongo-leaf);"></span>
                <div>
                  <h3 style="font-size: 13px; font-weight: 700; margin: 0;">Machine Learning Forensics Intelligence</h3>
                  <span class="font-mono text-muted text-xs">Unsupervised Isolation Forest • 150 Estimators • Contamination: 12% • Scikit-Learn Microservice</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span class="badge-tag green font-mono" id="mlModelEngineStatus">ENGINE ONLINE</span>
                <button class="btn btn-xs btn-primary" id="btnOverviewRunML">⚡ Run Anomaly Scan</button>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('nav-ml').click()">Full ML Workbench →</button>
              </div>
            </div>

            <!-- ML 4 Mini-KPIs -->
            <div class="kpi-grid mt-3" style="grid-template-columns: repeat(4, 1fr); gap: 12px;">
              <div style="background: var(--bg-surface); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span class="kpi-label" style="font-size: 10px;">TOTAL DETECTED ANOMALIES</span>
                <div class="kpi-val-row" style="margin-top: 4px;">
                  <span class="kpi-value text-rose" style="font-size: 20px;" id="mlKpiAnomalies">0</span>
                  <span class="kpi-subtag text-rose">Score ≥ 0.50</span>
                </div>
              </div>

              <div style="background: var(--bg-surface); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span class="kpi-label" style="font-size: 10px;">NORMAL BASELINE EVENTS</span>
                <div class="kpi-val-row" style="margin-top: 4px;">
                  <span class="kpi-value text-emerald" style="font-size: 20px;" id="mlKpiNormal">0</span>
                  <span class="kpi-subtag text-emerald">Conforming</span>
                </div>
              </div>

              <div style="background: var(--bg-surface); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span class="kpi-label" style="font-size: 10px;">SUSPICIOUS EVENTS</span>
                <div class="kpi-val-row" style="margin-top: 4px;">
                  <span class="kpi-value text-amber" style="font-size: 20px;" id="mlKpiSuspicious">0</span>
                  <span class="kpi-subtag">High / Critical</span>
                </div>
              </div>

              <div style="background: var(--bg-surface); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span class="kpi-label" style="font-size: 10px;">MEAN ANOMALY SCORE</span>
                <div class="kpi-val-row" style="margin-top: 4px;">
                  <span class="kpi-value" style="font-size: 20px;" id="mlKpiAvgScore">0.000</span>
                  <span class="kpi-subtag">WiredTiger BSON</span>
                </div>
              </div>
            </div>
          </div>"""

if kpi_grid_end in content:
    content = content.replace(kpi_grid_end, ml_overview_strip, 1)

# 3. Add ML Detections feed card in Overview bottom section
bottom_grid_target = """            <div class="clean-card">
              <div class="card-head-row">
                <h3>Recent Detection Findings</h3>
                <span class="badge-tag blue">MITRE ATT&CK</span>
              </div>
              <div class="findings-feed-list mt-2" id="overviewFindingsList">
                <p class="placeholder-note">Loading detection findings...</p>
              </div>
            </div>"""

bottom_grid_replacement = """            <div class="clean-card">
              <div class="card-head-row">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <h3>ML Isolation Forest Detections</h3>
                  <span class="font-mono text-muted text-xs">ml_detections</span>
                </div>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('nav-ml').click()">View All ML</button>
              </div>
              <div class="findings-feed-list mt-2" id="overviewMLDetectionsList">
                <p class="placeholder-note">Loading ML detections from MongoDB...</p>
              </div>
            </div>

            <div class="clean-card">
              <div class="card-head-row">
                <h3>Recent Detection Findings</h3>
                <span class="badge-tag blue">MITRE ATT&CK</span>
              </div>
              <div class="findings-feed-list mt-2" id="overviewFindingsList">
                <p class="placeholder-note">Loading detection findings...</p>
              </div>
            </div>"""

if bottom_grid_target in content:
    content = content.replace(bottom_grid_target, bottom_grid_replacement, 1)

# 4. Add the dedicated ML tab section
tab_overview_end = "</section>\n\n        <!-- ============================================================== -->\n        <!-- 2. INVESTIGATIONS MANAGEMENT -->"
if tab_overview_end not in content:
    tab_overview_end = "</section>\r\n\r\n        <!-- ============================================================== -->\r\n        <!-- 2. INVESTIGATIONS MANAGEMENT -->"

tab_ml_section = """</section>

        <!-- ============================================================== -->
        <!-- MACHINE LEARNING ANOMALY INTELLIGENCE WORKBENCH -->
        <!-- ============================================================== -->
        <section class="view-panel" id="tab-ml">
          <div class="section-title-row">
            <div>
              <h2>Machine Learning Anomaly Detection</h2>
              <p class="section-subtitle">Unsupervised Isolation Forest anomaly scoring and explainable attribution on digital evidence telemetry.</p>
            </div>
            <div class="header-action-group">
              <span class="badge-tag green font-mono" id="mlWorkbenchModelStatus">ISOLATION FOREST ONLINE</span>
              <button class="btn btn-primary" id="btnWorkbenchRunML">⚡ Run Anomaly Scan on Active Scope</button>
            </div>
          </div>

          <!-- ML KPI Strip -->
          <div class="kpi-grid mt-3">
            <div class="kpi-card">
              <span class="kpi-label">TOTAL EVALUATED EVENTS</span>
              <div class="kpi-val-row">
                <span class="kpi-value" id="mlTabTotalScored">0</span>
                <span class="kpi-subtag text-emerald">ml_detections</span>
              </div>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">CONFIRMED ANOMALIES</span>
              <div class="kpi-val-row">
                <span class="kpi-value text-rose" id="mlTabTotalAnomalies">0</span>
                <span class="kpi-subtag text-rose">Score ≥ 0.50</span>
              </div>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">BASELINE NORMAL EVENTS</span>
              <div class="kpi-val-row">
                <span class="kpi-value text-emerald" id="mlTabNormalEvents">0</span>
                <span class="kpi-subtag">Conforming</span>
              </div>
            </div>

            <div class="kpi-card">
              <span class="kpi-label">SUSPICIOUS THREATS</span>
              <div class="kpi-val-row">
                <span class="kpi-value text-amber" id="mlTabSuspiciousEvents">0</span>
                <span class="kpi-subtag">High / Critical</span>
              </div>
            </div>
          </div>

          <!-- Filter Bar -->
          <div class="clean-filter-bar mt-3">
            <div class="filter-group">
              <select id="mlThreatFilter" class="select-field">
                <option value="ALL">All Threat Levels</option>
                <option value="CRITICAL">Critical Threat</option>
                <option value="HIGH">High Threat</option>
                <option value="MEDIUM">Medium Threat</option>
                <option value="LOW">Low / Baseline</option>
              </select>
              <select id="mlMinScoreFilter" class="select-field">
                <option value="">All Anomaly Scores</option>
                <option value="0.50">Anomalies Only (Score ≥ 0.50)</option>
                <option value="0.60">Score ≥ 0.60</option>
                <option value="0.75">Score ≥ 0.75</option>
              </select>
            </div>
            <span class="font-mono text-muted text-xs" id="mlDetectionsCountLabel">0 detections</span>
          </div>

          <!-- Detections Table -->
          <div class="table-wrap mt-3">
            <table class="clean-data-table">
              <thead>
                <tr>
                  <th>Detection ID</th>
                  <th>Associated Evidence</th>
                  <th>Telemetry Title</th>
                  <th>Host</th>
                  <th>Anomaly Score</th>
                  <th>Threat Level</th>
                  <th>Detected Timestamp</th>
                  <th>Explainable Attribution & Contributing Features</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="mlDetectionsTableBody">
                <tr><td colspan="9" class="text-center text-muted">Loading ML detections from MongoDB...</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============================================================== -->
        <!-- 2. INVESTIGATIONS MANAGEMENT -->"""

if tab_overview_end in content:
    content = content.replace(tab_overview_end, tab_ml_section, 1)

# 5. Add ML Score column to Evidence Explorer table
th_target = """                <tr>
                  <th>Evidence ID</th>
                  <th>Artifact Class</th>
                  <th>Title</th>
                  <th>Source Host</th>
                  <th>Severity</th>
                  <th>Ver.</th>
                  <th>SHA-256 Hash</th>
                  <th>Event Timestamp</th>
                  <th>Actions</th>
                </tr>"""

th_replacement = """                <tr>
                  <th>Evidence ID</th>
                  <th>Artifact Class</th>
                  <th>Title</th>
                  <th>Source Host</th>
                  <th>Severity</th>
                  <th>ML Score</th>
                  <th>Ver.</th>
                  <th>SHA-256 Hash</th>
                  <th>Event Timestamp</th>
                  <th>Actions</th>
                </tr>"""

if th_target in content:
    content = content.replace(th_target, th_replacement, 1)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated public/index.html with ML Forensics UI successfully!")

