const { getDB } = require('./db');

/**
 * Self-Evolving Digital Evidence Intelligence Engine:
 * Detects Missing Links, Conflicting Evidence, and Suspicious Event Sequences
 */
async function analyzeCaseAnomalies(caseOrInvestigationId) {
  const db = getDB();

  const idQuery = {
    $or: [{ caseId: caseOrInvestigationId }, { investigationId: caseOrInvestigationId }]
  };

  const evidence = await db.collection('evidence')
    .find(idQuery)
    .sort({ timestamp: 1 })
    .toArray();

  const relations = await db.collection('evidence_relations')
    .find(idQuery)
    .toArray();

  if (!evidence || evidence.length === 0) {
    return {
      investigationId: caseOrInvestigationId,
      caseId: caseOrInvestigationId,
      missingLinks: [],
      conflictingEvidence: [],
      suspiciousSequences: [],
      summary: { totalAnomalies: 0, threatRating: 'LOW' }
    };
  }

  const missingLinks = detectMissingLinks(evidence, relations);
  const conflictingEvidence = detectConflictingEvidence(evidence);
  const suspiciousSequences = detectSuspiciousSequences(evidence);

  const totalAnomalies = missingLinks.length + conflictingEvidence.length + suspiciousSequences.length;
  let threatRating = 'LOW';
  if (totalAnomalies >= 5 || suspiciousSequences.some(s => s.threatScore > 80)) {
    threatRating = 'CRITICAL';
  } else if (totalAnomalies >= 2) {
    threatRating = 'HIGH';
  } else if (totalAnomalies > 0) {
    threatRating = 'MEDIUM';
  }

  return {
    investigationId: caseOrInvestigationId,
    caseId: caseOrInvestigationId,
    timestamp: new Date(),
    missingLinks,
    conflictingEvidence,
    suspiciousSequences,
    summary: {
      totalAnomalies,
      missingLinksCount: missingLinks.length,
      conflictsCount: conflictingEvidence.length,
      suspiciousSequencesCount: suspiciousSequences.length,
      threatRating
    }
  };
}

/**
 * 1. Missing Link Identification
 * Flags gaps in causation, missing parent processes, unrecorded credentials, or missing network connections
 */
function detectMissingLinks(evidence, relations) {
  const missingLinks = [];

  // Index evidence by ID, PIDs, Hosts, IPs
  const evById = new Map();
  const processSpawnMap = new Map(); // host:pid -> evidence
  const hostsSeen = new Set();
  const externalIpsSeen = new Set();

  for (const ev of evidence) {
    evById.set(ev.evidenceId, ev);
    hostsSeen.add(ev.sourceHost);

    const pid = ev.metadata && (ev.metadata.processId || ev.metadata.pid);
    if (pid && ev.sourceHost) {
      processSpawnMap.set(`${ev.sourceHost}:${pid}`, ev);
    }

    if (ev.metadata && ev.metadata.remoteIp) {
      externalIpsSeen.add(ev.metadata.remoteIp);
    }
  }

  // A. Check for Broken Process Ancestry (Parent PID exists in metadata but no parent spawn event found)
  for (const ev of evidence) {
    const parentPid = ev.metadata && (ev.metadata.parentProcessId || ev.metadata.ppid);
    const parentName = ev.metadata && ev.metadata.parentProcessName;
    if (parentPid && ev.sourceHost && parentPid > 4) { // ignore system PID 4
      const parentKey = `${ev.sourceHost}:${parentPid}`;
      if (!processSpawnMap.has(parentKey)) {
        missingLinks.push({
          id: `ML-PROC-${ev.evidenceId}`,
          anomalyType: 'MISSING_LINK',
          subType: 'ORPHAN_PROCESS_ANCESTRY',
          severity: 'HIGH',
          title: `Missing Parent Process Event (PID ${parentPid})`,
          description: `Evidence '${ev.title}' executed process '${ev.metadata.processName || 'unknown'}' with Parent PID ${parentPid} (${parentName || 'unnamed'}), but no prior process spawn log exists for that PID on host ${ev.sourceHost}.`,
          anchorEvidenceId: ev.evidenceId,
          anchorTimestamp: ev.timestamp,
          sourceHost: ev.sourceHost,
          hypothesizedEvidence: `Sysmon Event ID 1 or Audit Process Creation for PID ${parentPid} on ${ev.sourceHost}`,
          confidence: 0.92,
          recommendation: `Investigate potential direct injection, unlogged service execution, or log clearing around ${ev.timestamp.toISOString()}.`
        });
      }
    }
  }

  // B. Check for Lateral Movement without Authentication Record
  for (let i = 0; i < evidence.length; i++) {
    const ev = evidence[i];
    if (ev.mitreTactic === 'Lateral Movement' || (ev.metadata && (ev.metadata.targetHost || ev.metadata.destinationHost))) {
      const targetHost = ev.metadata.targetHost || ev.metadata.destinationHost;
      if (targetHost && targetHost !== ev.sourceHost) {
        // Look for auth event on targetHost within +/- 10 minutes
        const windowStart = new Date(new Date(ev.timestamp).getTime() - 10 * 60000);
        const windowEnd = new Date(new Date(ev.timestamp).getTime() + 10 * 60000);

        const foundAuth = evidence.some(other => 
          other.sourceHost === targetHost &&
          other.artifactType === 'SECURITY_EVENT' &&
          other.timestamp >= windowStart &&
          other.timestamp <= windowEnd &&
          (other.metadata && (other.metadata.eventCode === 4624 || other.metadata.logonType))
        );

        if (!foundAuth) {
          missingLinks.push({
            id: `ML-LAT-${ev.evidenceId}`,
            anomalyType: 'MISSING_LINK',
            subType: 'UNRECORDED_LATERAL_AUTHENTICATION',
            severity: 'CRITICAL',
            title: `Missing Authentication Event on ${targetHost}`,
            description: `Lateral movement initiated from ${ev.sourceHost} targeting ${targetHost}, but no matching Windows Security Logon (Event ID 4624 / Kerberos TGS) was discovered on ${targetHost}.`,
            anchorEvidenceId: ev.evidenceId,
            anchorTimestamp: ev.timestamp,
            sourceHost: targetHost,
            hypothesizedEvidence: `Security Event ID 4624 (Logon Type 3/10) or Kerberos Ticket Request on ${targetHost}`,
            confidence: 0.88,
            recommendation: `Verify domain controller audit policy, examine network TAP for SMB/RPC traffic, or check for Pass-the-Hash token manipulation.`
          });
        }
      }
    }
  }

  // C. Check for Outbound C2 / Exfiltration without Initial Download or Payload Artifact
  const c2Events = evidence.filter(ev => ev.mitreTactic === 'Command and Control' || ev.mitreTactic === 'Exfiltration');
  for (const c2 of c2Events) {
    const host = c2.sourceHost;
    const priorFileDrop = evidence.some(ev => 
      ev.sourceHost === host &&
      ev.timestamp <= c2.timestamp &&
      (ev.artifactType === 'FILE_INTEGRITY' || ev.mitreTactic === 'Initial Access')
    );

    if (!priorFileDrop) {
      missingLinks.push({
        id: `ML-C2-${c2.evidenceId}`,
        anomalyType: 'MISSING_LINK',
        subType: 'UNTRACED_INITIAL_INGRESS',
        severity: 'HIGH',
        title: `Unaccounted Ingress Vector Prior to C2 Beacon`,
        description: `External beaconing occurred from ${host} to ${c2.metadata.remoteIp || 'remote C2'}, but no preceding file download, email attachment, or exploit event is logged on this host.`,
        anchorEvidenceId: c2.evidenceId,
        anchorTimestamp: c2.timestamp,
        sourceHost: host,
        hypothesizedEvidence: `Perimeter proxy log, perimeter VPN auth, or browser download cache preceding ${c2.timestamp.toISOString()}`,
        confidence: 0.85,
        recommendation: `Request web gateway logs and email security gateway quarantine records for the 24 hours prior to ${c2.timestamp.toISOString()}.`
      });
    }
  }

  return missingLinks;
}

/**
 * 2. Conflicting Evidence Identification
 * Flags contradicting timestamps, impossible travel, conflicting hashes, and mismatched identities
 */
function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') || ip === 'localhost' || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip);
}

function detectConflictingEvidence(evidence) {
  const conflicts = [];

  // A. Impossible Travel / Concurrent Logins for Same Identity
  const userLogins = [];
  for (const ev of evidence) {
    const user = ev.metadata && (ev.metadata.user || ev.metadata.userName || ev.metadata.account);
    const ip = ev.metadata && (ev.metadata.sourceIp || ev.metadata.clientIp);
    const location = ev.metadata && ev.metadata.geoCountry;
    if (user && (ip || location)) {
      userLogins.push({
        evidenceId: ev.evidenceId,
        user,
        ip,
        location: location || 'Unknown',
        timestamp: new Date(ev.timestamp),
        title: ev.title
      });
    }
  }

  for (let i = 0; i < userLogins.length; i++) {
    for (let j = i + 1; j < userLogins.length; j++) {
      const l1 = userLogins[i];
      const l2 = userLogins[j];

      if (l1.user.toLowerCase() === l2.user.toLowerCase()) {
        const timeDiffMinutes = Math.abs(l2.timestamp - l1.timestamp) / (1000 * 60);

        // If different locations or different external subnets within 15 minutes
        const diffLocation = l1.location !== 'Unknown' && l2.location !== 'Unknown' && l1.location !== l2.location;
        const diffIps = l1.ip && l2.ip && l1.ip !== l2.ip && !isPrivateIp(l1.ip) && !isPrivateIp(l2.ip);

        if ((diffLocation || diffIps) && timeDiffMinutes < 20) {
          conflicts.push({
            id: `CONF-TRAVEL-${l1.evidenceId}-${l2.evidenceId}`,
            anomalyType: 'CONFLICTING_EVIDENCE',
            subType: 'IMPOSSIBLE_TRAVEL_CONCURRENCY',
            severity: 'CRITICAL',
            title: `Impossible Travel Conflict for User '${l1.user}'`,
            description: `User '${l1.user}' authenticated from ${l1.location} (${l1.ip || 'N/A'}) and ${l2.location} (${l2.ip || 'N/A'}) within ${Math.round(timeDiffMinutes)} minutes of each other. Physically impossible distance without credential compromise.`,
            evidenceIds: [l1.evidenceId, l2.evidenceId],
            conflictField: 'geo_velocity',
            details: {
              account: l1.user,
              event1: { id: l1.evidenceId, time: l1.timestamp, loc: l1.location, ip: l1.ip },
              event2: { id: l2.evidenceId, time: l2.timestamp, loc: l2.location, ip: l2.ip },
              deltaMinutes: Math.round(timeDiffMinutes)
            },
            confidence: 0.98,
            recommendation: `Immediate credential revocation for '${l1.user}'. Review active tokens in Azure AD / IdP.`
          });
        }
      }
    }
  }

  // B. File Hash Inconsistency Across Observation Points
  const fileMap = new Map(); // filename -> list of { evidenceId, hash, sourceHost, timestamp }
  for (const ev of evidence) {
    const filename = ev.metadata && (ev.metadata.fileName || ev.metadata.filePath);
    const hash = ev.metadata && ev.metadata.sha256;
    if (filename && hash) {
      const cleanName = filename.split(/[\\/]/).pop().toLowerCase();
      if (!fileMap.has(cleanName)) fileMap.set(cleanName, []);
      fileMap.get(cleanName).push({
        evidenceId: ev.evidenceId,
        hash,
        sourceHost: ev.sourceHost,
        timestamp: ev.timestamp,
        artifactType: ev.artifactType
      });
    }
  }

  for (const [filename, records] of fileMap.entries()) {
    if (records.length > 1) {
      const uniqueHashes = new Set(records.map(r => r.hash));
      if (uniqueHashes.size > 1) {
        conflicts.push({
          id: `CONF-HASH-${filename}`,
          anomalyType: 'CONFLICTING_EVIDENCE',
          subType: 'FILE_HASH_DISCREPANCY',
          severity: 'HIGH',
          title: `Conflicting Cryptographic Hash for '${filename}'`,
          description: `Payload '${filename}' was observed with multiple distinct SHA-256 hashes across forensic artifacts (e.g., perimeter gateway vs endpoint disk), indicating file tampering, polymorphism, or misattribution.`,
          evidenceIds: records.map(r => r.evidenceId),
          conflictField: 'sha256',
          details: {
            filename,
            observations: records
          },
          confidence: 0.94,
          recommendation: `Perform binary diff of retrieved samples from GridFS evidence vault to identify payload modification.`
        });
      }
    }
  }

  // C. Timestamp Inversion / Timestomping Paradox
  for (const ev of evidence) {
    if (ev.metadata && ev.metadata.compileTime && ev.timestamp) {
      const compileTime = new Date(ev.metadata.compileTime);
      const executionTime = new Date(ev.timestamp);
      // If compile time is in the future relative to execution
      if (compileTime > executionTime) {
        conflicts.push({
          id: `CONF-TIME-${ev.evidenceId}`,
          anomalyType: 'CONFLICTING_EVIDENCE',
          subType: 'TIMESTOMPING_INVERSION',
          severity: 'HIGH',
          title: `Timestomping Detected: PE Header Inversion`,
          description: `Evidence '${ev.title}' records execution at ${executionTime.toISOString()}, but the PE Header compile timestamp is dated ${compileTime.toISOString()} (future timestamp), proving deliberate timestamp forgery.`,
          evidenceIds: [ev.evidenceId],
          conflictField: 'timestamp_chronology',
          details: { compileTime, executionTime },
          confidence: 0.96,
          recommendation: `Extract $STANDARD_INFORMATION and $FILE_NAME NTFS attributes to recover original MFT timestamps.`
        });
      }
    }
  }

  return conflicts;
}

/**
 * 3. Suspicious Event Sequence Reconstruction
 * Identifies MITRE ATT&CK multi-stage sequences, living-off-the-land chains, and rapid bursts
 */
function detectSuspiciousSequences(evidence) {
  const sequences = [];

  // A. Rapid File Modification / Pre-Encryption Burst (Ransomware signature)
  const fileEvents = evidence.filter(ev => 
    ev.artifactType === 'FILE_INTEGRITY' || 
    (ev.metadata && ev.metadata.action === 'FILE_MODIFIED')
  );

  if (fileEvents.length >= 8) {
    const first = new Date(fileEvents[0].timestamp);
    const last = new Date(fileEvents[fileEvents.length - 1].timestamp);
    const durationSec = (last - first) / 1000;

    // Check if shadow copy deletion is also present
    const shadowCopyDel = evidence.find(ev => 
      ev.metadata && 
      ((ev.metadata.commandLine && ev.metadata.commandLine.includes('vssadmin delete shadows')) ||
       (ev.title && ev.title.toLowerCase().includes('shadow copy')))
    );

    if (durationSec < 120 || shadowCopyDel) {
      sequences.push({
        id: `SEQ-RANSOMWARE-${Date.now()}`,
        anomalyType: 'SUSPICIOUS_SEQUENCE',
        sequenceName: 'Ransomware Mass Encryption & Inhibited Recovery Sequence',
        severity: 'CRITICAL',
        threatScore: 98,
        description: `Rapid cascade of ${fileEvents.length} file modifications within ${Math.round(durationSec)}s coupled with shadow copy deletion commands. Matches T1486 (Data Encrypted for Impact) and T1490 (Inhibit System Recovery).`,
        evidenceChain: fileEvents.map(e => e.evidenceId).concat(shadowCopyDel ? [shadowCopyDel.evidenceId] : []),
        mitreChain: ['Defense Evasion', 'Impact'],
        attackStagesDetected: ['Inhibit Recovery', 'Mass Encryption'],
        confidence: 0.99,
        remediation: `Isolate affected hosts immediately. Verify offline backup status.`
      });
    }
  }

  // B. Living-off-the-Land (LotL) / Defense Evasion to Credential Access Sequence
  const lotlTools = ['powershell', 'certutil', 'wmic', 'rundll32', 'regsvr32', 'vssadmin', 'mimikatz', 'psexec'];
  const chainMatches = [];

  for (const ev of evidence) {
    const cmd = (ev.metadata && ev.metadata.commandLine) ? ev.metadata.commandLine.toLowerCase() : '';
    const proc = (ev.metadata && ev.metadata.processName) ? ev.metadata.processName.toLowerCase() : '';

    for (const tool of lotlTools) {
      if (cmd.includes(tool) || proc.includes(tool)) {
        chainMatches.push({ ev, tool });
        break;
      }
    }
  }

  if (chainMatches.length >= 3) {
    sequences.push({
      id: `SEQ-LOTL-${Date.now()}`,
      anomalyType: 'SUSPICIOUS_SEQUENCE',
      sequenceName: 'Living-off-the-Land Dual-Use Binary Execution Chain',
      severity: 'HIGH',
      threatScore: 88,
      description: `Sequential execution of native administrative binaries (${chainMatches.map(c => c.tool).join(' -> ')}) without developer workflow context. Used to evade signature detection.`,
      evidenceChain: chainMatches.map(c => c.ev.evidenceId),
      mitreChain: ['Execution', 'Defense Evasion', 'Credential Access'],
      confidence: 0.93,
      remediation: `Enforce AppLocker / WDAC constrained language mode and alert on LOLBAS invocations.`
    });
  }

  // C. Full MITRE ATT&CK Multi-Stage Intrusion Progression
  const tacticsInOrder = [];
  const tacticEvents = new Map();

  for (const ev of evidence) {
    if (ev.mitreTactic && ev.mitreTactic !== 'Other') {
      if (!tacticEvents.has(ev.mitreTactic)) {
        tacticEvents.set(ev.mitreTactic, []);
        tacticsInOrder.push(ev.mitreTactic);
      }
      tacticEvents.get(ev.mitreTactic).push(ev.evidenceId);
    }
  }

  if (tacticsInOrder.length >= 4) {
    sequences.push({
      id: `SEQ-MITRE-KILLCHAIN-${Date.now()}`,
      anomalyType: 'SUSPICIOUS_SEQUENCE',
      sequenceName: 'Coordinated Multi-Stage Cyber Kill Chain Progression',
      severity: 'CRITICAL',
      threatScore: 95,
      description: `Attackers progressed across ${tacticsInOrder.length} distinct MITRE ATT&CK stages (${tacticsInOrder.join(' -> ')}). Indicates structured, human-operated adversary campaign.`,
      evidenceChain: Array.from(tacticEvents.values()).flat(),
      mitreChain: tacticsInOrder,
      confidence: 0.96,
      remediation: `Activate full Incident Response team. Evacuate Active Directory domain credentials.`
    });
  }

  return sequences;
}

module.exports = {
  analyzeCaseAnomalies,
  detectMissingLinks,
  detectConflictingEvidence,
  detectSuspiciousSequences
};
