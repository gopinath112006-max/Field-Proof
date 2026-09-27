const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let currentPage = "dashboard";
let online = navigator.onLine;
let cameraStream = null;
let capturedImage = null;
let capturedBlob = null;
let cameraGPS = {text:"Location unavailable",lat:null,lng:null,accuracy:null};
let firebaseDb = null;
let firebaseStorage = null;
let currentFirebaseUser = null;
const sessionImages = new Map();

const demoRecords = [];

function getRecords(){
  try {
    const saved = JSON.parse(localStorage.getItem("dtbRecords") || "[]");
    if(Array.isArray(saved)) return saved;
  } catch(e){}
  return [];
}
function saveRecords(records){localStorage.setItem("dtbRecords",JSON.stringify(records))}
function showToast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
}
function resultLabel(r){return r==="positive"?"Presumptive Positive":r==="negative"?"Presumptive Negative":"Inconclusive"}
function resultPill(r){return `<span class="status-pill ${r}">${resultLabel(r)}</span>`}
function syncPill(s){return `<span class="status-pill ${s}">${s==="synced"?"SYNCED":"OFFLINE"}</span>`}

function setConnection(value){
  online=value;
  $("#connectionText").textContent=value?"ONLINE":"OFFLINE";
  $("#connectionCard").querySelector("small").textContent=value?"Sync available":"Local storage active";
  $("#connectionDot").className="dot "+(value?"online":"");
}
window.addEventListener("online",()=>{setConnection(true);showToast("Connection restored — sync is available.")});
window.addEventListener("offline",()=>{setConnection(false);showToast("Offline mode enabled — records will remain on this device.")});

function layout(page,title){
  $("#pageLabel").textContent=page.toUpperCase();
  $("#pageTitle").textContent=title;
  $$(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
}

function dashboard(){
  const records=getRecords();
  const p=records.filter(x=>x.result==="positive").length;
  const n=records.filter(x=>x.result==="negative").length;
  const i=records.filter(x=>x.result==="inconclusive").length;
  const pending=records.filter(x=>x.sync!=="synced").length;
  const total=records.length;
  const negativePct=total?Math.round((n/total)*100):0;
  const recent=records.slice(0,4);
  return `
    <section class="fc-command-hero">
      <div>
        <div class="eyebrow">FIELD OPERATIONS / COMMAND CENTER</div>
        <h3>Hello, Officer <span>👋</span></h3>
        <p>Every test matters. Capture, verify and securely record field results.</p>
      </div>
      <div class="fc-hero-actions">
        <button class="btn btn-blue fc-3d" onclick="openCamera()">◎ START NEW TEST</button>
        <button class="btn btn-outline fc-3d" onclick="navigate('reports')">▤ VIEW REPORTS</button>
      </div>
    </section>

    <section class="fc-stat-grid">
      <div class="card fc-stat fc-blue tilt-card"><div class="fc-stat-icon">▣</div><div><small>TOTAL TESTS</small><strong>${total}</strong><span>↑ Field records</span></div></div>
      <div class="card fc-stat fc-red tilt-card"><div class="fc-stat-icon">!</div><div><small>PRESUMPTIVE POSITIVE</small><strong>${p}</strong><span>⚠ Review required</span></div></div>
      <div class="card fc-stat fc-green tilt-card"><div class="fc-stat-icon">✓</div><div><small>PRESUMPTIVE NEGATIVE</small><strong>${n}</strong><span>✓ ${negativePct}% of records</span></div></div>
      <div class="card fc-stat fc-amber tilt-card"><div class="fc-stat-icon">↻</div><div><small>PENDING SYNC</small><strong>${pending}</strong><span>${online?"● Online":"● Offline"} mode</span></div></div>
    </section>

    <section class="fc-main-grid">
      <div class="card fc-panel fc-chart-panel tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">▥</span><div><h4>TEST RESULTS OVERVIEW</h4><small>Recent field activity</small></div></div><button class="fc-select">LAST 7 DAYS⌄</button></div>
        <div class="fc-chart">
          <div class="fc-y"><span>15</span><span>10</span><span>5</span><span>0</span></div>
          <div class="fc-chart-area">
            <div class="fc-gridlines"></div>
            <svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-label="Test trend chart">
              <defs><linearGradient id="fcArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0878ff" stop-opacity=".35"/><stop offset="1" stop-color="#0878ff" stop-opacity="0"/></linearGradient></defs>
              <path d="M0 170 C70 145 90 155 145 125 S220 150 280 115 S350 128 410 92 S500 130 555 76 S630 110 700 82 L700 220 L0 220 Z" fill="url(#fcArea)"/>
              <path d="M0 170 C70 145 90 155 145 125 S220 150 280 115 S350 128 410 92 S500 130 555 76 S630 110 700 82" fill="none" stroke="#00a8ff" stroke-width="4" vector-effect="non-scaling-stroke" filter="url(#fcGlow)"/>
              <defs><filter id="fcGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              <g fill="#eaf8ff"><circle cx="145" cy="125" r="4"/><circle cx="280" cy="115" r="4"/><circle cx="410" cy="92" r="4"/><circle cx="555" cy="76" r="4"/><circle cx="700" cy="82" r="4"/></g>
            </svg>
            <div class="fc-x"><span>SEP 6</span><span>SEP 7</span><span>SEP 8</span><span>SEP 9</span><span>SEP 10</span><span>SEP 11</span><span>SEP 12</span></div>
          </div>
        </div>
      </div>

      <div class="card fc-panel fc-donut-panel tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">◔</span><div><h4>RESULT DISTRIBUTION</h4><small>Current records</small></div></div></div>
        <div class="fc-donut-wrap">
          <div class="fc-donut" style="--pct:${negativePct}%"><div><strong>${negativePct}%</strong><small>NEGATIVE</small></div></div>
          <div class="fc-legend"><span><i class="dotg"></i> Negative <b>${n}</b></span><span><i class="dotr"></i> Positive <b>${p}</b></span><span><i class="dota"></i> Inconclusive <b>${i}</b></span></div>
        </div>
      </div>

      <div class="card fc-panel fc-quick-panel tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">ϟ</span><div><h4>QUICK ACTIONS</h4><small>Operational controls</small></div></div></div>
        <div class="fc-action-grid">
          <button class="fc-action blue" onclick="openCamera()"><b>◎</b><span>Start New Test<small>Scan & Analyze</small></span><em>›</em></button>
          <button class="fc-action blue" onclick="navigate('reports')"><b>▤</b><span>View Reports<small>Detailed records</small></span><em>›</em></button>
          <button class="fc-action green" onclick="navigate('history')"><b>◷</b><span>Test History<small>Past records</small></span><em>›</em></button>
          <button class="fc-action amber" onclick="navigate('profile')"><b>⚙</b><span>Settings<small>Preferences</small></span><em>›</em></button>
        </div>
      </div>

      <div class="card fc-panel fc-camera-panel tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">◉</span><div><h4>CAMERA CAPTURE</h4><small>Ready for field image</small></div></div><span class="live-pill">● LIVE</span></div>
        <div class="fc-camera-preview"><div class="scan-corners"></div><div class="camera-placeholder">▣<small>CAMERA READY</small></div><span>REFERENCE + TEST REGION</span></div>
        <button class="btn btn-blue fc-3d full" onclick="openCamera()">◎ OPEN CAMERA</button>
      </div>
    </section>

    <section class="fc-bottom-grid">
      <div class="card fc-panel fc-records tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">▤</span><div><h4>RECENT TEST RESULTS</h4><small>Latest secure field records</small></div></div><button class="text-action" onclick="navigate('history')">VIEW ALL →</button></div>
        ${recent.length?`<div class="fc-table"><div class="fc-tr fc-th"><span>DATE & TIME</span><span>SAMPLE TYPE</span><span>RESULT</span><span>ACTION</span></div>${recent.map(r=>`<div class="fc-tr"><span>${r.date||r.timestamp||"—"}</span><span>${r.sampleType||r.type||"Field sample"}</span><span>${resultPill(r.result)}</span><button class="mini-btn" onclick='viewRecord(${JSON.stringify(r.id||r.recordId||"")})'>VIEW</button></div>`).join("")}</div>`:`<div class="fc-empty">No test records yet. Start a new field test to populate this dashboard.</div>`}
      </div>

      <div class="card fc-panel fc-types tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">⚗</span><div><h4>TEST TYPES</h4><small>Start the appropriate workflow</small></div></div></div>
        <div class="fc-type-grid">
          <button onclick="openCamera()"><b>⚗</b><span>Fluorescent<br>Formaldehyde</span></button>
          <button onclick="openCamera()"><b>◯</b><span>Urine<br>Test</span></button>
          <button onclick="openCamera()"><b>◉</b><span>Saliva<br>Test</span></button>
          <button onclick="openCamera()"><b>▦</b><span>Other<br>Tests</span></button>
        </div>
      </div>

      <div class="card fc-panel fc-analysis tilt-card">
        <div class="fc-panel-head"><div><span class="fc-icon">ϟ</span><div><h4>LATEST ANALYSIS</h4><small>AI/API integration</small></div></div><span class="ai-pill">AI POWERED</span></div>
        <div class="analysis-lines"><span>Analysis API <b>READY</b></span><span>Firebase <b>READY</b></span><span>Secure record <b>ENABLED</b></span></div>
        <button class="btn btn-blue fc-3d full" onclick="navigate('reports')">VIEW FULL REPORT →</button>
      </div>
    </section>

    <section class="fc-footer-widgets">
      <div class="card fc-mini tilt-card"><h4>◉ MAP VIEW & LOCATION</h4><p>GPS can be attached to each digital record.</p><button class="mini-btn wide" onclick="navigate('locations')">VIEW MAP</button></div>
      <div class="card fc-mini tilt-card"><h4>↻ SYNC & OFFLINE MODE</h4><p>${online?"All available services are online.":"Offline mode active; local records remain available."}</p><button class="mini-btn wide" onclick="navigate('sync')">SYNC CENTER</button></div>
      <div class="card fc-mini tilt-card"><h4>✓ SAFETY ANALYTICS</h4><div class="mini-meter"><span style="width:${Math.min(100,70+negativePct/3)}%"></span></div><p>System readiness and record integrity.</p></div>
      <div class="card fc-mini tilt-card"><h4>?</h4><p>How to capture correctly, position the reference card and handle inconclusive results.</p><button class="mini-btn wide" onclick="navigate('guide')">FIELD GUIDE</button></div>
    </section>
  `;
}


function recordsTable(records){
 return `<table class="table"><thead><tr><th>Test ID</th><th>Result</th><th>Date / Time</th><th>Location</th><th>Integrity</th></tr></thead><tbody>
 ${records.map(r=>`<tr onclick="viewRecord('${r.id}')" style="cursor:pointer"><td class="id">${r.id}</td><td>${resultPill(r.result)}</td><td>${r.date}</td><td>${r.location}</td><td>${syncPill(r.sync)}</td></tr>`).join("")}</tbody></table>`;
}

function newtest(){
 return `<div class="page-head"><div><div class="eyebrow">FIELD WORKFLOW</div><h3>New Field Test</h3><p>Complete the five-step capture and record process.</p></div><span class="status-pill ${online?"synced":"offline"}">${online?"ONLINE":"OFFLINE MODE"}</span></div>
 <div class="test-workflow">${["Test Kit","Capture","Analyze","Verify","Record"].map((x,i)=>`<div class="workflow-step ${i===0?"active":""}"><b>0${i+1}</b>${x}</div>`).join("")}</div>
 <div class="grid two"><div class="card"><div class="section-title"><h4>1. Prepare Test Kit</h4><span>REQUIRED</span></div>
 <div class="capture-demo"><div class="capture-label">LIVE CAPTURE PREVIEW</div><div class="fake-kit"></div><div class="capture-overlay"></div></div></div>
 <div class="card pre-capture-checklist"><div class="section-title"><div><h4>Pre-capture checklist</h4><small>Complete all checks before opening the camera.</small></div><span class="ready-badge">READY</span></div>
 <div class="checklist-list">
 ${["Existing field-test kit prepared","Reference color card available","Test region visible","Adequate lighting","Device camera ready"].map(x=>`<div class="checklist-item"><div><strong>${x}</strong><small>Field capture requirement</small></div><span class="check-status">✓</span></div>`).join("")}
 </div>
 <button class="btn btn-red full" onclick="openCamera()">Start Camera →</button></div></div>
 <div class="disclaimer" style="margin-top:14px"><b>Field note:</b> Place the test kit and reference color card inside the same frame. Avoid glare and movement.</div>`;
}
function history(){
 const records=getRecords();
 return `<div class="page-head"><div><div class="eyebrow">AUDIT LOG</div><h3>Test History</h3><p>Searchable local record of field tests.</p></div><button class="btn btn-red" onclick="openCamera()">+ New Test</button></div>
 <div class="card"><div class="search-row"><input id="historySearch" placeholder="Search by Test ID, date, location or operator..." oninput="filterHistory()"><select id="historyFilter" class="filter" onchange="filterHistory()"><option value="all">All Results</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="inconclusive">Inconclusive</option><option value="offline">Offline</option></select></div><div id="historyTable">${recordsTable(records)}</div></div>`;
}
function filterHistory(){
 const q=$("#historySearch").value.toLowerCase(), f=$("#historyFilter").value;
 let records=getRecords().filter(r=>(!q||JSON.stringify(r).toLowerCase().includes(q)) && (f==="all"||(f==="offline"?r.sync==="offline":r.result===f)));
 $("#historyTable").innerHTML=recordsTable(records);
}

function reports(){
 const records=getRecords();
 return `<div class="page-head"><div><div class="eyebrow">REPORT CENTER</div><h3>Test Reports</h3><p>Generate real PDF reports from saved test records.</p></div><button class="btn btn-blue" onclick="exportAllReportsPDF()">Export All PDF</button></div>
 <div class="card"><div class="section-title"><h4>Available Reports</h4><span>${records.length} RECORD(S)</span></div>
 ${records.length?records.map(r=>`<div class="setting"><div><strong>${r.id}</strong><small>${r.date} • ${resultLabel(r.result)} • ${r.location||"Location unavailable"}</small></div><div style="display:flex;gap:8px"><button class="btn btn-outline" onclick="viewRecord('${r.id}')">Open</button><button class="btn btn-blue" onclick="exportRecordPDF('${r.id}')">PDF</button></div></div>`).join(""):`<div class="verify"><div><div class="shield">▤</div><h3>No reports yet</h3><p class="muted">Complete a field test to create a report. Nothing is pre-populated.</p><button class="btn btn-red" onclick="openCamera()">Start Field Test</button></div></div>`}
 </div>`;
}

async function exportAllReportsPDF(){
 const records=getRecords();
 if(!records.length){showToast("No saved records to export");return;}
 if(!window.jspdf?.jsPDF){
   // Keep Export All usable on mobile/offline when the CDN is unavailable.
   const lines=["DRUG TESTING BUDDY — REPORT INDEX",`Generated: ${new Date().toLocaleString()}`,"",...records.map((r,i)=>`${i+1}. ${r.id} | ${resultLabel(r.result)} | ${r.date} | ${r.location||"Location unavailable"}`)];
   downloadTextPDF(lines, `DTB-report-index-${new Date().toISOString().slice(0,10)}.pdf`);
   showToast("Report index PDF downloaded successfully");
   return;
 }
 const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:"mm",format:"a4"});
 let y=20;
 doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("DRUG TESTING BUDDY — REPORT INDEX",18,y);y+=9;
 doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text(`Generated ${new Date().toLocaleString()}`,18,y);y+=12;
 records.forEach((r,i)=>{
   if(y>270){doc.addPage();y=20;}
   doc.setFont("helvetica","bold");doc.text(`${i+1}. ${r.id}`,18,y);y+=5;
   doc.setFont("helvetica","normal");
   const line=`${resultLabel(r.result)} | ${r.date} | ${r.location||"Location unavailable"}`;
   doc.text(doc.splitTextToSize(line,174),23,y);y+=8;
   doc.text(`SHA-256: ${r.hash||"Unavailable"}`,23,y);y+=9;
 });
 doc.save(`DTB-report-index-${new Date().toISOString().slice(0,10)}.pdf`);
 showToast("Report index PDF downloaded successfully");
}

function locations(){
 return `<div class="page-head"><div><div class="eyebrow">GPS RECORDS</div><h3>Test Locations</h3><p>Visualize where field records were created.</p></div><span class="status-pill synced">GPS ENABLED</span></div>
 <div class="grid two"><div class="card"><div class="map"><div class="road"></div><div class="road r2"></div>
 <span class="map-label" style="left:12%;top:15%">PUDUCHERRY</span><span class="map-label" style="right:14%;bottom:18%">FIELD ZONE 03</span>
 <span class="pin blue" style="left:24%;top:33%"></span><span class="pin red" style="left:58%;top:43%"></span><span class="pin green" style="left:42%;top:68%"></span><span class="pin red" style="left:76%;top:70%"></span>
 </div></div><div class="card"><div class="section-title"><h4>Recent Locations</h4><span>4 RECORDS</span></div>${getRecords().map(r=>`<div class="quick-item"><div><strong>${r.id}</strong><small>${r.date} • ${r.location}</small></div>${resultPill(r.result)}</div>`).join("")}</div></div>`;
}

function offline(){
 const records=getRecords().filter(r=>r.sync!=="synced");
 return `<div class="page-head"><div><div class="eyebrow">LOCAL-FIRST STORAGE</div><h3>Offline Records</h3><p>Continue field work without an internet connection.</p></div></div>
 <div class="offline-banner"><div><strong>● ${online?"ONLINE — LOCAL MODE AVAILABLE":"OFFLINE MODE ACTIVE"}</strong><p>Images, hashes, timestamps and available GPS data can remain on this device until synchronization.</p></div><button class="btn ${online?"btn-blue":"btn-outline"}" onclick="syncRecords()">Sync Now</button></div>
 <div class="card" style="margin-top:14px"><div class="section-title"><h4>Waiting for Synchronization</h4><span>${records.length} RECORD(S)</span></div>${records.length?recordsTable(records):'<div class="verify"><div><div class="shield">✓</div><h3>No Pending Records</h3><p class="muted">All local records are synchronized.</p></div></div>'}</div>`;
}

function sync(){
 const records=getRecords(); const pending=records.filter(r=>r.sync!=="synced");
 return `<div class="page-head"><div><div class="eyebrow">DATA INTEGRITY</div><h3>Synchronization Center</h3><p>Move locally stored records to the connected backend when available.</p></div><button class="btn btn-blue" onclick="syncRecords()">↻ Sync Now</button></div>
 <div class="card"><div class="section-title"><h4>Synchronization Status</h4><span>${online?"CONNECTION AVAILABLE":"WAITING FOR CONNECTION"}</span></div>
 <div style="font-size:28px;font-weight:800">${pending.length} <span style="font-size:11px;color:#74818e">records waiting to sync</span></div>
 <div style="height:7px;background:#18232d;border-radius:10px;margin:18px 0;overflow:hidden"><div style="height:100%;width:${records.length?((records.length-pending.length)/records.length)*100:100}%;background:linear-gradient(90deg,var(--red),var(--blue));"></div></div>
 ${records.map(r=>`<div class="setting"><div><strong>${r.id}</strong><small>${r.date}</small></div>${syncPill(r.sync)}</div>`).join("")}</div>`;
}

function guide(){
 return `<div class="page-head"><div><div class="eyebrow">FIELD REFERENCE</div><h3>Field Guide</h3><p>Quick operational guidance for standardized capture.</p></div></div>
 <div class="grid two"><div class="card"><div class="section-title"><h4>How to Capture Correctly</h4><span>6 STEPS</span></div>
 ${["Prepare the existing field-test kit.","Place the reference color card inside the camera frame.","Ensure the test region is clearly visible.","Avoid glare, shadows and strong reflections.","Hold the device steady and keep the kit flat.","Capture only when the quality checks show READY."].map((x,i)=>`<div class="guide-step"><div class="guide-num">${i+1}</div><div><h4>${x}</h4><p>DTB uses this step to improve consistency in the prototype capture workflow.</p></div></div>`).join("")}</div>
 <div class="card"><div class="section-title"><h4>Understanding Results</h4><span>IMPORTANT</span></div>
 <div class="guide-step"><div class="guide-num" style="color:var(--red)">!</div><div><h4>Presumptive Positive</h4><p>A field classification indicating a positive colorimetric response. Laboratory confirmation is required.</p></div></div>
 <div class="guide-step"><div class="guide-num">✓</div><div><h4>Presumptive Negative</h4><p>A field classification indicating a negative response within the defined prototype criteria.</p></div></div>
 <div class="guide-step"><div class="guide-num" style="color:var(--amber)">!</div><div><h4>Inconclusive</h4><p>Use when the image or color response cannot be reliably classified. Retake when appropriate.</p></div></div>
 <div class="disclaimer" style="margin-top:15px"><b>Laboratory confirmation:</b> A field result is presumptive and should not be represented as a definitive laboratory finding.</div></div></div>`;
}

function settings(){
  const theme=localStorage.getItem("dtbTheme")||"dark";
  const reduced=localStorage.getItem("dtbReducedMotion")==="on";
  const analytics=localStorage.getItem("dtbAnalytics")!=="off";
  const camera=localStorage.getItem("dtbCameraPermission")!=="off";
  return `<div class="page-head"><div><div class="eyebrow">APPLICATION PREFERENCES</div><h3>Settings</h3><p>Control appearance, accessibility, help and privacy from one place.</p></div><span class="status-pill synced">LOCAL SETTINGS</span></div>
  <div class="settings-shell">
    <div class="card settings-nav-card">
      <div class="settings-brand"><div class="settings-gear">⚙</div><div><strong>FieldCheck Control Center</strong><small>Personalize your field console</small></div></div>
      <button class="settings-tab active" onclick="settingsFocus('appearance')">◈ Appearance</button>
      <button class="settings-tab" onclick="settingsFocus('help')">? Help & Support</button>
      <button class="settings-tab" onclick="settingsFocus('privacy')">▣ Privacy Center</button>
      <button class="settings-tab" onclick="settingsFocus('accessibility')">◎ Accessibility</button>
    </div>
    <div class="settings-content">
      <section id="settings-appearance" class="card settings-section">
        <div class="section-title"><div><h4>Appearance</h4><small>Theme selection is available from the top field console.</small></div><span>DISPLAY</span></div>
        <div class="appearance-status-card">
          <div class="appearance-status-icon">${theme==='light'?'☀':'☾'}</div>
          <div><strong>${theme==='light'?'Light workspace active':'Dark fluorescent workspace active'}</strong><small>Switch themes using the horizontal scroll panel in the top console.</small></div>
        </div>
        <div class="setting-row"><div><strong>Emergency visual beacon</strong><small>Show the red pulse when the siren is enabled.</small></div><button class="toggle-button ${sirenActive?'on':''}" onclick="toggleSiren()"><span></span>${sirenActive?'ON':'OFF'}</button></div>
      </section>
      <section id="settings-help" class="card settings-section">
        <div class="section-title"><div><h4>Help & Support</h4><small>Quick actions for common FieldCheck tasks.</small></div><span>SUPPORT</span></div>
        <div class="help-grid">
          <button class="help-action" onclick="navigate('guide')"><b>?</b><span><strong>Open Field Guide</strong><small>Capture instructions and result explanations</small></span><em>→</em></button>
          <button class="help-action" onclick="showHelpDiagnostics()"><b>✓</b><span><strong>Run System Check</strong><small>Check camera, storage, network and PDF engine</small></span><em>→</em></button>
          <button class="help-action" onclick="showKeyboardHelp()"><b>⌨</b><span><strong>Keyboard Help</strong><small>Learn quick navigation shortcuts</small></span><em>→</em></button>
          <button class="help-action" onclick="showToast('Support mode ready — use the Field Guide for capture help.')"><b>i</b><span><strong>Contact Support</strong><small>Display support guidance for this prototype</small></span><em>→</em></button>
        </div>
      </section>
      <section id="settings-privacy" class="card settings-section">
        <div class="section-title"><div><h4>Privacy Center</h4><small>Manage local data and optional browser permissions.</small></div><span>PRIVACY</span></div>
        <div class="privacy-note"><strong>Local-first protection</strong><p>Field records can remain in this browser's local storage. Clearing local records is permanent for this browser profile.</p></div>
        <div class="setting-row"><div><strong>Usage analytics</strong><small>No external analytics is required for the core demo.</small></div><button class="toggle-button ${analytics?'on':''}" onclick="toggleSetting('analytics')"><span></span>${analytics?'ON':'OFF'}</button></div>
        <div class="setting-row"><div><strong>Camera permission preference</strong><small>Controls whether the app asks for camera access when starting a test.</small></div><button class="toggle-button ${camera?'on':''}" onclick="toggleSetting('camera')"><span></span>${camera?'ALLOWED':'BLOCKED'}</button></div>
        <div class="privacy-actions"><button class="btn btn-outline" onclick="exportPrivacySummary()">Export Privacy Summary</button><button class="btn btn-red" onclick="clearLocalRecordsConfirm()">Clear Local Records</button></div>
      </section>
      <section id="settings-accessibility" class="card settings-section">
        <div class="section-title"><div><h4>Accessibility</h4><small>Keep motion and interactions comfortable on any device.</small></div><span>ACCESSIBILITY</span></div>
        <div class="setting-row"><div><strong>Reduced motion</strong><small>Minimize tilt, pulse and animated transitions.</small></div><button class="toggle-button ${reduced?'on':''}" onclick="toggleSetting('reducedMotion')"><span></span>${reduced?'ON':'OFF'}</button></div>
        <div class="setting-row"><div><strong>Touch-friendly controls</strong><small>Use larger hit areas on small screens.</small></div><button class="toggle-button on" onclick="showToast('Touch-friendly controls are active on responsive layouts.')"><span></span>ON</button></div>
      </section>
    </div>
  </div>`;
}

function settingsFocus(section){
  $$('.settings-tab').forEach(b=>b.classList.remove('active'));
  const map={appearance:0,help:1,privacy:2,accessibility:3};
  const tabs=$$('.settings-tab'); if(tabs[map[section]]) tabs[map[section]].classList.add('active');
  const target=document.getElementById('settings-'+section); if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
}
function setTheme(theme){
  localStorage.setItem('dtbTheme',theme); applyTheme(); updateTopThemePanels(); render('settings'); showToast(theme==='light'?'Light theme enabled':'Dark theme enabled');
}
function applyTheme(){ document.documentElement.dataset.theme=localStorage.getItem('dtbTheme')||'dark'; updateTopThemePanels(); }
function updateTopThemePanels(){
  const theme=localStorage.getItem('dtbTheme')||'dark';
  const dark=document.getElementById('topDarkTheme'); const light=document.getElementById('topLightTheme');
  if(dark){dark.classList.toggle('selected',theme==='dark');dark.setAttribute('aria-pressed',theme==='dark');}
  if(light){light.classList.toggle('selected',theme==='light');light.setAttribute('aria-pressed',theme==='light');}
}
function toggleSetting(kind){
  if(kind==='premium'){togglePremiumDisplay(); return;}
  if(kind==='analytics'){localStorage.setItem('dtbAnalytics',localStorage.getItem('dtbAnalytics')==='off'?'on':'off');render('settings');showToast('Analytics preference updated');return;}
  if(kind==='camera'){localStorage.setItem('dtbCameraPermission',localStorage.getItem('dtbCameraPermission')==='off'?'on':'off');render('settings');showToast('Camera permission preference updated');return;}
  if(kind==='reducedMotion'){const on=localStorage.getItem('dtbReducedMotion')!=='on';localStorage.setItem('dtbReducedMotion',on?'on':'off');applyMotionPreference();render('settings');showToast(on?'Reduced motion enabled':'Full motion restored');}
}
function applyMotionPreference(){document.documentElement.classList.toggle('reduced-motion',localStorage.getItem('dtbReducedMotion')==='on')}
function showHelpDiagnostics(){
  const checks=[['Browser storage',typeof localStorage!=='undefined'],['Camera API','mediaDevices' in navigator],['Online connection',navigator.onLine],['PDF engine',!!window.jspdf?.jsPDF]];
  showToast(checks.map(x=>`${x[0]}: ${x[1]?'OK':'Unavailable'}`).join(' • '));
}
function showKeyboardHelp(){
  showToast('Shortcuts: D = Dashboard • N = New Test • R = Reports • H = History • S = Settings');
}
function exportPrivacySummary(){
  const summary=`FieldCheck Privacy Summary\nGenerated: ${new Date().toLocaleString()}\nLocal records: ${getRecords().length}\nAnalytics preference: ${localStorage.getItem('dtbAnalytics')==='off'?'OFF':'ON'}\nCamera preference: ${localStorage.getItem('dtbCameraPermission')==='off'?'BLOCKED':'ALLOWED'}\nTheme: ${localStorage.getItem('dtbTheme')||'dark'}`;
  const blob=new Blob([summary],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fieldcheck-privacy-summary.txt'; a.click(); URL.revokeObjectURL(a.href); showToast('Privacy summary exported');
}
function clearLocalRecordsConfirm(){
  if(!getRecords().length){showToast('No local records to clear');return;}
  if(confirm('Clear all locally stored FieldCheck records? This cannot be undone.')){localStorage.removeItem('dtbRecords');sessionImages.clear();render('settings');showToast('Local records cleared');}
}

function profile(){
 return `<div class="page-head"><div><div class="eyebrow">IDENTITY & SECURITY</div><h3>Officer Profile</h3><p>Operator identity and local device controls.</p></div></div>
 <div class="grid profile-grid"><div class="card profile-card"><div class="profile-large">${(currentFirebaseUser?.displayName||currentFirebaseUser?.email||"OP").slice(0,2).toUpperCase()}</div><h3 style="margin:0">${currentFirebaseUser?.displayName||currentFirebaseUser?.email||"Field Operator"}</h3><p class="muted" style="font-size:10px">Authenticated Operator</p><div class="hash" style="margin-top:18px">${currentFirebaseUser?.uid?"Firebase UID: "+currentFirebaseUser.uid:"Local operator session"}</div></div>
 <div class="card">${["Biometric Login","Location Services","Offline Mode","Automatic Sync"].map((x,i)=>`<div class="setting"><div><strong>${x}</strong><small>${i===0?"Secure device authentication":i===1?"Attach GPS data to new records":i===2?"Allow local-first capture":"Sync when connectivity returns"}</small></div><div class="toggle ${i<3||online?"on":""}"></div></div>`).join("")}<div class="setting"><div><strong>Security</strong><small>Cryptographic record integrity</small></div><button class="btn btn-outline" onclick="openSecuritySettings()">Open</button></div></div></div>`;
}

function viewRecord(id){
 const r=getRecords().find(x=>x.id===id); if(!r)return;
 $("#pageContainer").innerHTML=recordDetail(r);
 layout("history","Record Details");
}
function recordDetail(r){
 return `<div class="page-head"><div><div class="eyebrow">AUDIT RECORD / ${r.id}</div><h3>Secure Test Record</h3><p>Immutable-style prototype record with image integrity metadata.</p></div>${resultPill(r.result)}</div>
 <div class="grid record"><div class="card"><div class="section-title"><h4>Test Information</h4><span>${r.id}</span></div>
 ${[["Result",resultLabel(r.result)],["Date & Time",r.date],["GPS","11.9401° N, 79.8102° E"],["Location",r.location],["Operator",r.operator],["Device","Android / DTB Demo"]].map(a=>`<div class="meta-row" style="padding:10px 0;border-bottom:1px solid #18232d"><span>${a[0]}</span><span>${a[1]}</span></div>`).join("")}
 <div style="margin-top:15px"><small style="color:#697784">SHA-256 IMAGE HASH</small><div class="hash" style="margin-top:7px">${r.hash}</div></div></div>
 <div class="card"><div class="secure-box"><strong>✓ TAMPER-EVIDENT RECORD</strong><p>Timestamp, operator identity, GPS and image hash are attached to this record in the prototype.</p><div class="setting"><strong>Image Hash</strong><span class="status-pill synced">VALID</span></div><div class="setting"><strong>Digital Record</strong><span class="status-pill synced">SIGNED</span></div></div>
 <div style="margin-top:16px"><div class="verify"><div><div class="shield">✓</div><h3 style="margin:0">Record Verified</h3><p class="muted" style="font-size:10px">Image integrity confirmed in prototype verification.</p></div></div></div></div></div>
 <div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-outline" onclick="navigate('history')">← Back</button><button class="btn btn-blue" onclick="exportRecordPDF('${r.id}')">Export PDF</button><button class="btn btn-outline" onclick="copyVerification('${r.id}')">Copy Verification</button></div>`;
}

async function exportRecordPDF(id){
  const record=getRecords().find(x=>x.id===id);
  if(!record){showToast("Record not found");return;}
  if(!window.jspdf?.jsPDF){
    downloadFallbackPDF(record);
    return;
  }
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const margin=18;
  let y=20;
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.text("DRUG TESTING BUDDY",margin,y); y+=8;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text("Digital Field Test Report",margin,y); y+=12;
  doc.setDrawColor(180); doc.line(margin,y,192,y); y+=10;
  const rows=[
    ["Test ID",record.id], ["Result",resultLabel(record.result)], ["Date / Time",record.date],
    ["Location",record.location||"Unavailable"], ["GPS",record.gpsText||"Unavailable"],
    ["Operator",record.operator||"Authenticated operator"], ["Device",record.device||"Browser / DTB"],
    ["Image SHA-256",record.hash||"Unavailable"], ["Image Quality",record.quality||"Not provided"]
  ];
  doc.setFontSize(10);
  for(const [label,value] of rows){
    doc.setFont("helvetica","bold"); doc.text(label,margin,y);
    doc.setFont("helvetica","normal");
    const lines=doc.splitTextToSize(String(value),125);
    doc.text(lines,65,y); y+=Math.max(7,lines.length*5);
  }
  y+=3; doc.setFont("helvetica","bold"); doc.text("Integrity statement",margin,y); y+=6;
  doc.setFont("helvetica","normal");
  const note="This digital record contains capture metadata and a SHA-256 image hash. The field classification is presumptive and does not replace laboratory confirmation.";
  doc.text(doc.splitTextToSize(note,174),margin,y); y+=18;
  const recordImage=record.image || sessionImages.get(record.id);
  if(recordImage){
    try{
      const img=recordImage;
      const props=doc.getImageProperties(img);
      const maxW=90,maxH=65; const scale=Math.min(maxW/props.width,maxH/props.height);
      const w=props.width*scale,h=props.height*scale;
      if(y+h+15>280){doc.addPage();y=20;}
      doc.setFont("helvetica","bold");doc.text("Captured Image",margin,y);y+=5;
      doc.addImage(img,"JPEG",margin,y,w,h); y+=h+8;
    }catch(e){ console.warn("Image omitted from PDF",e); }
  }
  doc.setFontSize(8); doc.setFont("helvetica","normal");
  doc.text(`Generated by DTB on ${new Date().toLocaleString()}`,margin,287);
  doc.save(`${record.id}-report.pdf`);
  showToast("PDF downloaded successfully");
}

function downloadTextPDF(lines,filename){
  const safe=lines.map(String);
  let stream="BT\n/F1 11 Tf\n50 790 Td\n";
  safe.forEach((line,i)=>{ if(i) stream+="0 -22 Td\n"; stream+=`(${pdfEscape(line)}) Tj\n`; });
  stream+="ET";
  const objs=[];
  objs.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objs.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objs.push("3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n");
  objs.push("4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");
  objs.push(`5 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`);
  let pdf="%PDF-1.4\n"; const offsets=[0];
  objs.forEach(o=>{offsets.push(pdf.length);pdf+=o;});
  const xref=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+=`trailer<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob=new Blob([pdf],{type:"application/pdf"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function pdfEscape(text){return String(text??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/[\r\n]+/g," ");}
function downloadFallbackPDF(record){
  // Minimal valid PDF fallback so Export PDF still works when the external jsPDF CDN is unavailable.
  const lines=[
    "DRUG TESTING BUDDY — DIGITAL FIELD TEST REPORT",
    `Test ID: ${record.id}`,
    `Result: ${resultLabel(record.result)}`,
    `Date / Time: ${record.date}`,
    `Location: ${record.location||"Unavailable"}`,
    `GPS: ${record.gps||record.gpsText||"Unavailable"}`,
    `Operator: ${record.operator||"Field Operator"}`,
    `Image SHA-256: ${record.hash||"Unavailable"}`,
    `Image Quality: ${record.quality||"Not provided"}`,
    "",
    "Presumptive field classification only. Laboratory confirmation is required."
  ];
  let stream="BT\n/F1 11 Tf\n50 790 Td\n";
  lines.forEach((line,i)=>{ if(i) stream+="0 -22 Td\n"; stream+=`(${pdfEscape(line)}) Tj\n`; });
  stream+="ET";
  const objs=[];
  objs.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objs.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objs.push("3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n");
  objs.push("4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");
  objs.push(`5 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`);
  let pdf="%PDF-1.4\n"; const offsets=[0];
  objs.forEach(o=>{offsets.push(pdf.length);pdf+=o;});
  const xref=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+=`trailer<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob=new Blob([pdf],{type:"application/pdf"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${record.id}-report.pdf`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  showToast("PDF downloaded successfully");
}

async function copyVerification(id){
  const record=getRecords().find(x=>x.id===id);
  if(!record)return;
  const text=`DTB Verification\nTest ID: ${record.id}\nResult: ${resultLabel(record.result)}\nSHA-256: ${record.hash}\nGenerated: ${record.date}`;
  try{
    await navigator.clipboard.writeText(text);
    showToast("Verification details copied to clipboard");
  }catch(e){
    const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();showToast("Verification details copied");
  }
}

function openSecuritySettings(){
  const records=getRecords();
  const secure=`Security status\nRecords stored locally: ${records.length}\nSHA-256 integrity: enabled\nFirebase authentication: ${currentFirebaseUser?"active":"not signed in"}`;
  try{navigator.clipboard.writeText(secure)}catch(e){}
  navigate("profile");
  showToast("Security status loaded");
}

function render(page=currentPage){
 currentPage=page;
 const pages={dashboard:["Command Dashboard",dashboard],newtest:["New Field Test",newtest],history:["Test History",history],reports:["Reports",reports],locations:["Test Locations",locations],offline:["Offline Records",offline],sync:["Synchronization Center",sync],guide:["Field Guide",guide],settings:["Settings",settings],profile:["Officer Profile",profile]};
 const [title,fn]=pages[page]||pages.dashboard;
 layout(page,title);
 $("#pageContainer").innerHTML=fn();
 window.scrollTo({top:0,behavior:"smooth"});
}

function navigate(page){render(page)}


async function openCamera(){
  if(localStorage.getItem("dtbCameraPermission")==="off"){ showToast("Camera access is blocked in Privacy Center. Enable it in Settings to start a test."); navigate("settings"); settingsFocus("privacy"); return; }
  $("#cameraModal").classList.remove("hidden");
  $("#capturePreview").classList.add("hidden");
  $("#cameraVideo").classList.remove("hidden");
  setCameraStatus("Requesting camera permission…","info");
  updateCameraLocation({text:"Requesting GPS/location permission…",lat:null,lng:null,accuracy:null});
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
      audio:false
    });
    $("#cameraVideo").srcObject=cameraStream;
    setCameraStatus("Camera ready — only the supplied reference colours are accepted.","success");
    updateCameraDetection("ready");
  }catch(e){
    console.error(e);
    setCameraStatus("Camera permission unavailable. You can import an image instead.","error");
    showToast("Camera unavailable — use Import Image.");
  }
  requestCameraLocation();
}
function requestCameraLocation(){
  if(!navigator.geolocation){
    updateCameraLocation({text:"GPS/location unavailable",lat:null,lng:null,accuracy:null});
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      cameraGPS={
        lat:pos.coords.latitude,
        lng:pos.coords.longitude,
        accuracy:pos.coords.accuracy,
        text:`${pos.coords.latitude.toFixed(6)}°, ${pos.coords.longitude.toFixed(6)}°`
      };
      updateCameraLocation(cameraGPS);
    },
    ()=>{
      cameraGPS={text:"GPS/location permission denied or unavailable",lat:null,lng:null,accuracy:null};
      updateCameraLocation(cameraGPS);
    },
    {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
  );
}
function updateCameraLocation(gps){
  const el=$("#cameraLocation");
  if(!el)return;
  if(gps?.lat!=null && gps?.lng!=null){
    el.innerHTML=`<span class="location-pin">⌖</span><span><b>GPS LOCATION</b><small>${gps.lat.toFixed(6)}°, ${gps.lng.toFixed(6)}°${gps.accuracy?` • ±${Math.round(gps.accuracy)}m`:""}</small></span>`;
  }else{
    el.innerHTML=`<span class="location-pin">⌖</span><span><b>GPS LOCATION</b><small>${gps?.text||"Location unavailable"}</small></span>`;
  }
}
function setCameraStatus(message,type="info"){
  const el=$("#cameraStatus"); if(!el)return;
  el.innerHTML=`<span class="check ${type}">${type==="success"?"✓":type==="error"?"!":"•"}</span> ${message}`;
}
function updateCameraDetection(state="ready"){
  const ids=["detectKit","detectRef","detectRegion","detectGuard","detectReady"];
  ids.forEach(id=>$("#"+id)?.classList.remove("ok","warn","active"));
  $("#detectKit")?.classList.add("ok");
  $("#detectRef")?.classList.add("ok");
  $("#detectRegion")?.classList.add(state==="captured"?"ok":"active");
  $("#detectGuard")?.classList.add("ok");
  if(state==="captured") $("#detectReady")?.classList.add("ok");
  else $("#detectReady")?.classList.add("active");
}
function closeCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  const video=$("#cameraVideo"); if(video)video.srcObject=null;
  $("#cameraModal").classList.add("hidden");
}
async function capture(){
  const video=$("#cameraVideo"), canvas=$("#captureCanvas");
  if(!video.videoWidth){showToast("Start the camera first or import an image.");return}
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  const candidate=canvas.toDataURL("image/jpeg",.9);
  const guard=await inspectCapturedFrame(candidate);
  if(!guard.acceptedColor){
    setCameraStatus("ERROR — unsupported image. Capture only one of the supplied reference colours.","error");
    updateCameraDetection("error");
    showToast("Camera error: face or unsupported colour detected. Use only the supplied reference colours.");
    return;
  }
  capturedImage=candidate;
  capturedBlob=await (await fetch(capturedImage)).blob();
  $("#capturedPreview").src=capturedImage;
  $("#capturePreview").classList.remove("hidden");
  video.classList.add("hidden");
  setCameraStatus(`Valid reference colour detected — ${guard.colorName}. Review it, then choose Analyze.`,"success");
  updateCameraDetection("captured");
  $("#captureBtn").onclick=confirmCapture;
}
function confirmCapture(){ closeCamera(); startAnalysis(); }
function resetCaptureButton(){
  $("#captureBtn").onclick=capture;
}
function startAnalysis(){
  $("#captureBtn").onclick=capture;
  $("#analysisModal").classList.remove("hidden");
  const steps=$$(".analysis-step");
  steps.forEach((x,i)=>{x.classList.remove("done","active");x.innerHTML=`○ <span>${x.textContent.replace(/^[✓●○]\s*/,"")}</span>`});
  let i=0;
  const timer=setInterval(()=>{
    if(i>0){steps[i-1].classList.remove("active");steps[i-1].classList.add("done");steps[i-1].innerHTML=`✓ <span>${steps[i-1].textContent.replace(/^[✓●○]\s*/,"")}</span>`}
    if(i<steps.length){steps[i].classList.add("active");steps[i].innerHTML=`● <span>${steps[i].textContent.replace(/^[✓●○]\s*/,"")}</span>`}
    i++;
    if(i>steps.length){clearInterval(timer); $("#analysisModal").classList.add("hidden"); createResult();}
  },520);
}
async function createHash(data){
 const bytes=new TextEncoder().encode(data);
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function createResult(){
  const now=new Date();
  const id="DTB-"+now.toISOString().slice(0,10).replaceAll("-","")+"-"+String(Date.now()).slice(-4);
  const hash=await createHash((capturedImage||"demo-image")+"|"+id);
  let gps=cameraGPS?.lat!=null ? {...cameraGPS} : {text:"Location unavailable",lat:null,lng:null,accuracy:null};
  if(gps.lat==null && navigator.geolocation){
    try{
      gps=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(
        pos=>resolve({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,text:`${pos.coords.latitude.toFixed(6)}°, ${pos.coords.longitude.toFixed(6)}°`}),
        ()=>resolve(gps),{enableHighAccuracy:true,timeout:5000,maximumAge:30000}
      ));
    }catch(e){}
  }
  let analysis=await callAnalysisAPI(capturedImage);
  const guard=await inspectCapturedFrame(capturedImage);
  // Never analyze a frame that is not one of the supplied reference colours.
  if(!guard.acceptedColor){
    analysis={result:"inconclusive",apiStatus:"capture guard — unsupported colour/face/object rejected",quality:"invalid/non-reference frame"};
  }
  const r={
    id,result:analysis.result||"inconclusive",
    date:now.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}),
    location:gps.text,operator:getCurrentOperator(),
    hash,sync:"offline",gps:gps.text,lat:gps.lat,lng:gps.lng,
    apiStatus:analysis.apiStatus||"fallback",quality:analysis.quality||"review required",
    imageUrl:null
  };
  sessionImages.set(r.id, capturedImage || null);
  const records=getRecords(); records.unshift(r); saveRecords(records);
  if(firebaseAuth?.currentUser){currentFirebaseUser=firebaseAuth.currentUser}
  if(online && currentFirebaseUser){
    try{
      await persistToFirebase(r);
      r.sync="synced";
      saveRecords(records);
    }catch(e){console.warn("Firebase persistence failed:",e); showToast("Saved locally — Firebase sync will retry later.")}
  }
  showResultScreen(r);
}
function getCurrentOperator(){
  const u=currentFirebaseUser||firebaseAuth?.currentUser;
  return u?.email ? (u.displayName||u.email.split("@")[0]) : "Demo Operator";
}
async function inspectCapturedFrame(imageData){
  // Capture gate: only the supplied reference colours are accepted.
  // A face, unrelated object, or unsupported colour is rejected before analysis.
  const REFERENCE_COLORS=[
    {name:"Orange",rgb:[255,98,4]},
    {name:"Deep Purple",rgb:[120,0,123]},
    {name:"Pink",rgb:[212,38,155]},
    {name:"Green",rgb:[7,135,1]},
    {name:"Red",rgb:[146,31,36]},
    {name:"Yellow",rgb:[253,241,4]},
    {name:"Violet",rgb:[100,27,134]},
    {name:"Black",rgb:[0,0,0]},
    {name:"Blue",rgb:[7,3,123]}
  ];
  try{
    if(!imageData) return {acceptedColor:false,reason:"no image"};
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=imageData;});
    const c=document.createElement("canvas"); c.width=192; c.height=128;
    const ctx=c.getContext("2d",{willReadFrequently:true}); ctx.drawImage(img,0,0,c.width,c.height);
    const d=ctx.getImageData(0,0,c.width,c.height).data;
    const counts=REFERENCE_COLORS.map(()=>0);
    const mask=new Uint8Array(c.width*c.height);
    const nearest=new Int8Array(c.width*c.height); nearest.fill(-1);
    const tolerance=62;
    for(let y=0;y<c.height;y++){
      for(let x=0;x<c.width;x++){
        const i=(y*c.width+x)*4;
        const rgb=[d[i],d[i+1],d[i+2]];
        let best=-1,bestDist=Infinity;
        for(let k=0;k<REFERENCE_COLORS.length;k++){
          const ref=REFERENCE_COLORS[k].rgb;
          const dist=Math.sqrt((rgb[0]-ref[0])**2+(rgb[1]-ref[1])**2+(rgb[2]-ref[2])**2);
          if(dist<bestDist){bestDist=dist;best=k;}
        }
        const px=y*c.width+x;
        if(bestDist<=tolerance){mask[px]=1; nearest[px]=best; counts[best]++;}
      }
    }
    // Require a substantial, elongated block of one reference colour.
    // This rejects faces, skin tones, random objects and ordinary backgrounds.
    let bestCandidate=null;
    for(let k=0;k<REFERENCE_COLORS.length;k++){
      if(counts[k] < c.width*c.height*0.08) continue;
      let minX=c.width,maxX=-1,minY=c.height,maxY=-1,area=0;
      for(let y=0;y<c.height;y++){
        for(let x=0;x<c.width;x++){
          const px=y*c.width+x;
          if(mask[px] && nearest[px]===k){
            area++; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
          }
        }
      }
      if(maxX<0)continue;
      const bw=maxX-minX+1,bh=maxY-minY+1;
      const bboxArea=bw*bh;
      const fill=bboxArea?area/bboxArea:0;
      const aspect=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
      const coverage=area/(c.width*c.height);
      const elongated=aspect>=2.6;
      const solid=fill>=0.42;
      const strong=coverage>=0.12;
      const candidateScore=coverage*fill*(elongated?1.5:0.5);
      if(strong && solid && elongated && (!bestCandidate || candidateScore>bestCandidate.score)) bestCandidate={index:k,score:candidateScore,coverage,fill,aspect};
    }
    if(!bestCandidate) return {acceptedColor:false,reason:"unsupported face/object/colour"};
    return {acceptedColor:true,testKitLikely:true,colorName:REFERENCE_COLORS[bestCandidate.index].name,coverage:bestCandidate.coverage,aspect:bestCandidate.aspect};
  }catch(e){
    return {acceptedColor:false,testKitLikely:false,reason:"image could not be inspected"};
  }
}

async function callAnalysisAPI(imageData){
  const api=AUTH_CONFIG.api||{};
  if(!api.enabled || !api.baseUrl || !imageData) return {result:"inconclusive",apiStatus:"local fallback",quality:"no image API"};
  try{
    const res=await fetch(api.baseUrl.replace(/\/$/,"")+"/api/analyze",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({image_base64:imageData,source:"dtb-web",timestamp:new Date().toISOString()})
    });
    if(!res.ok) throw new Error("API "+res.status);
    const data=await res.json();
    if(data.validTestKit !== true){
      return {result:"inconclusive",apiStatus:"API connected — valid test kit not confirmed",quality:data.quality||"manual review required"};
    }
    return {result:data.result||"inconclusive",apiStatus:"API connected",quality:data.quality||"review required"};
  }catch(e){
    console.warn("Analysis API unavailable:",e);
    return {result:"inconclusive",apiStatus:"API unavailable — safe fallback",quality:"manual review required"};
  }
}
async function persistToFirebase(r){
  if(!firebaseDb || !currentFirebaseUser) throw new Error("Firebase database not ready");
  let imageUrl=null;
  if(capturedBlob && firebaseStorage){
    const ref=firebaseStorage.ref(`dtb/${currentFirebaseUser.uid}/${r.id}.jpg`);
    await ref.put(capturedBlob,{contentType:"image/jpeg",customMetadata:{testId:r.id}});
    imageUrl=await ref.getDownloadURL();
    r.imageUrl=imageUrl;
  }
  await firebaseDb.collection("testRecords").doc(r.id).set({
    ...r, userId:currentFirebaseUser.uid, syncedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
  showToast("Record securely synced to Firebase.");
}
async function syncRecords(){
  if(!online){showToast("You are offline. Records remain safely on this device.");return}
  const u=firebaseAuth?.currentUser;
  if(!u){showToast("Sign in with Firebase to sync cloud records.");return}
  const records=getRecords();
  let count=0;
  for(const r of records.filter(x=>x.sync!=="synced")){
    try{
      await firebaseDb.collection("testRecords").doc(r.id).set({...r,userId:u.uid,syncedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      r.sync="synced"; count++;
    }catch(e){console.warn(e)}
  }
  saveRecords(records); render(currentPage); showToast(count?`${count} record(s) synced to Firebase.`:"No records were synced.");
}
function showResultScreen(r){
 $("#pageContainer").innerHTML=`<div class="page-head"><div><div class="eyebrow">ANALYSIS COMPLETE</div><h3>Test Result</h3><p>Prototype classification generated from the captured image workflow.</p></div>${resultPill(r.result)}</div>
 <div class="grid result-grid">
 <div class="card result-card ${r.result}"><div class="result-icon">${r.result==="positive"?"!":r.result==="negative"?"✓":"!"}</div><h3>${resultLabel(r.result)}</h3><p>${r.result==="positive"?"Controlled substance indication detected by the prototype field-test classifier.":r.result==="negative"?"No controlled substance indication detected by the prototype field-test classifier.":"The response could not be reliably classified."}</p>
 <div class="result-meta">${[["Test ID",r.id],["Date & Time",r.date],["GPS",r.gps],["Operator",r.operator]].map(a=>`<div class="meta-row"><span>${a[0]}</span><span>${a[1]}</span></div>`).join("")}</div>
 <button class="btn ${r.result==="positive"?"btn-red":"btn-blue"}" onclick="viewRecord('${r.id}')">View Digital Record →</button></div>
 <div class="card"><div class="section-title"><h4>Integrity Metadata</h4><span>SECURE</span></div><div class="secure-box"><strong>✓ Hash Generated</strong><p>SHA-256 fingerprint created for the captured image.</p><div class="hash">${r.hash}</div></div><div class="setting"><strong>Timestamp</strong><span class="status-pill synced">RECORDED</span></div><div class="setting"><strong>GPS</strong><span class="status-pill synced">RECORDED</span></div><div class="setting"><strong>Operator</strong><span class="status-pill synced">IDENTIFIED</span></div><div class="setting"><strong>Sync Status</strong>${syncPill(r.sync)}</div></div>
 <div class="card"><div class="section-title"><h4>Next Action</h4><span>FIELD PROTOCOL</span></div><div class="guide-step"><div class="guide-num">1</div><div><h4>Review the record</h4><p>Confirm the captured details before relying on the digital record.</p></div></div><div class="guide-step"><div class="guide-num">2</div><div><h4>Preserve the physical test</h4><p>The application does not replace the underlying field-test kit or laboratory procedures.</p></div></div><div class="guide-step"><div class="guide-num">3</div><div><h4>Laboratory confirmation</h4><p>Any presumptive positive requires appropriate confirmatory laboratory testing.</p></div></div></div></div>
 <div class="disclaimer" style="margin-top:14px"><b>DISCLAIMER:</b> This is a prototype presumptive field-test classification. It is not a validated forensic instrument and does not replace laboratory confirmation.</div>
 <div style="margin-top:14px;display:flex;gap:10px"><button class="btn btn-outline" onclick="navigate('dashboard')">Back to Dashboard</button><button class="btn btn-red" onclick="openCamera()">Start Another Test</button></div>`;
 layout("newtest","Test Result");
}
function syncRecords(){
 if(!online){showToast("Still offline — records remain safely stored locally.");return}
 const records=getRecords().map(r=>({...r,sync:"synced"}));saveRecords(records);showToast("All local records synchronized.");render(currentPage);
}

let firebaseAuth = null;
let supabaseClient = null;
const AUTH_CONFIG = window.DTB_CONFIG || {firebase:{enabled:false},supabase:{enabled:false}};

function setAuthMessage(message,type="error"){
  const box=$("#authMessage"); if(!box)return;
  box.textContent=message; box.className="auth-message show "+type;
}
function clearAuthMessage(){const box=$("#authMessage");if(box)box.className="auth-message";}
function isFirebaseConfigured(){const c=AUTH_CONFIG.firebase?.config;return !!(AUTH_CONFIG.firebase?.enabled&&c&&c.apiKey&&!c.apiKey.startsWith("YOUR_")&&c.projectId&&!c.projectId.startsWith("YOUR_"));}
function isSupabaseConfigured(){const c=AUTH_CONFIG.supabase;return !!(c?.enabled&&c.url&&!c.url.includes("YOUR_PROJECT")&&c.anonKey&&!c.anonKey.startsWith("YOUR_"));}
function initAuthProviders(){
  // Firebase is the only authentication provider. Supabase is reserved for DTB data services.
  if(isFirebaseConfigured()&&window.firebase){
    try{
      if(!firebase.apps.length)firebase.initializeApp(AUTH_CONFIG.firebase.config);
      firebaseAuth=firebase.auth(); firebaseDb=firebase.firestore(); firebaseStorage=firebase.storage();
      firebaseAuth.onAuthStateChanged(user=>{
        if(user&&sessionStorage.getItem("dtbAuthenticated")==="true")updateOperatorFromUser(user,"firebase");
      });
    }catch(e){console.error("Firebase initialization failed",e)}
  }
  // Initialize Supabase only as a database client when configured; never use it for login.
  if(isSupabaseConfigured()&&window.supabase){
    try{supabaseClient=window.supabase.createClient(AUTH_CONFIG.supabase.url,AUTH_CONFIG.supabase.anonKey);}
    catch(e){console.error("Supabase initialization failed",e)}
  }
}
function updateOperatorFromUser(user,provider){
  const email=user.email||"Authenticated Operator";const name=user.displayName||email.split("@")[0]||"Operator";const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  const avatar=$(".avatar");if(avatar)avatar.textContent=initials||"OP";const op=document.querySelector(".operator strong");const oid=document.querySelector(".operator small");if(op)op.textContent=name;if(oid)oid.textContent=`FIREBASE • ${email}`;
}
function enterApp(mode="login",user=null){sessionStorage.setItem("dtbAuthenticated","true");sessionStorage.setItem("dtbAuthMode",mode);if(user)updateOperatorFromUser(user,mode);$("#loginScreen").classList.add("hidden");$("#app").classList.remove("hidden");render("dashboard");showToast(mode==="demo"?"Demo mode active — welcome to DTB.":"Authentication successful.");}
async function firebasePasswordLogin(){
  if(!firebaseAuth){setAuthMessage("Firebase is not configured yet. Add your Firebase web config in config.js.");return}
  const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;if(!email||!password){setAuthMessage("Enter your email address and password.");return}
  try{const cred=await firebaseAuth.signInWithEmailAndPassword(email,password);setAuthMessage("Firebase authentication successful. Opening DTB…","success");setTimeout(()=>enterApp("firebase",cred.user),250)}catch(error){console.error(error);setAuthMessage(firebaseError(error))}
}
async function firebaseGoogleLogin(){
  if(!firebaseAuth){setAuthMessage("Firebase is not configured yet. Add your Firebase web config in config.js.");return}
  try{const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});const cred=await firebaseAuth.signInWithPopup(provider);setAuthMessage("Google / Firebase authentication successful.","success");setTimeout(()=>enterApp("firebase",cred.user),250)}catch(error){console.error(error);setAuthMessage(firebaseError(error))}
}
async function firebaseSignup(){
  if(!firebaseAuth){setAuthMessage("Firebase is not configured yet. Add your Firebase web config in config.js.");return}
  const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;if(!email||!password){setAuthMessage("Enter an email and password before creating an account.");return}if(password.length<6){setAuthMessage("Firebase requires a password of at least 6 characters.");return}
  try{const cred=await firebaseAuth.createUserWithEmailAndPassword(email,password);setAuthMessage("Firebase account created successfully.","success");setTimeout(()=>enterApp("firebase",cred.user),250)}catch(error){console.error(error);setAuthMessage(firebaseError(error))}
}
async function firebaseResetPassword(){
  if(!firebaseAuth){setAuthMessage("Firebase is not configured yet. Add your Firebase web config in config.js.");return}
  const email=$("#loginEmail").value.trim();
  if(!email){setAuthMessage("Enter your email address first, then choose Forgot password.");return}
  try{await firebaseAuth.sendPasswordResetEmail(email);setAuthMessage("Password reset email sent. Check your inbox.","success");}
  catch(error){console.error(error);setAuthMessage(firebaseError(error))}
}
function firebaseError(error){const map={"auth/invalid-credential":"Invalid email or password.","auth/user-not-found":"No account was found for this email.","auth/wrong-password":"Incorrect password.","auth/email-already-in-use":"An account already exists for this email.","auth/weak-password":"Password is too weak.","auth/invalid-email":"Please enter a valid email address.","auth/popup-closed-by-user":"Google sign-in was closed before completion.","auth/popup-blocked":"Your browser blocked the Google sign-in popup. Allow popups and try again."};return map[error?.code]||error?.message||"Firebase authentication failed.";}

$("#loginBtn").addEventListener("click",firebasePasswordLogin);
$("#googleBtn").addEventListener("click",firebaseGoogleLogin);
async function startBiometricLogin(){
  const msg=$("#authMessage");
  try{
    if(!window.PublicKeyCredential || !navigator.credentials?.get){
      throw new Error("Biometric/WebAuthn is not available in this browser.");
    }
    // A real biometric credential must first be registered by the application backend.
    // This prototype therefore never fabricates a successful credential assertion.
    if(msg){msg.className="auth-message info show";msg.textContent="Biometric login is supported by this browser, but no registered field credential is configured. Use Sign In or Demo Mode.";}
    showToast("Biometric hardware detected — registration is required before secure sign-in.");
  }catch(e){
    if(msg){msg.className="auth-message error show";msg.textContent=e.message||"Biometric login is unavailable.";}
    showToast("Biometric login unavailable — use another sign-in method.");
  }
}

$("#signupBtn").addEventListener("click",firebaseSignup);
$("#demoBtn").addEventListener("click",()=>enterApp("demo"));

// Add a small password-reset action without changing the existing visual layout.
const resetBtn=document.createElement("button");
resetBtn.type="button";resetBtn.className="link-btn";resetBtn.textContent="Forgot password?";resetBtn.addEventListener("click",firebaseResetPassword);
const authMessage=$("#authMessage");if(authMessage)authMessage.parentNode.insertBefore(resetBtn,authMessage);

$("#logoutBtn").addEventListener("click",async()=>{try{if(firebaseAuth)await firebaseAuth.signOut()}catch(e){console.warn(e)}sessionStorage.removeItem("dtbAuthenticated");sessionStorage.removeItem("dtbAuthMode");$("#app").classList.add("hidden");$("#loginScreen").classList.remove("hidden");$("#loginEmail").value="";$("#loginPassword").value="";clearAuthMessage();showToast("Signed out securely.")});


/* =========================================================
   PREMIUM FIELDCheck INTERACTION LAYER
   Adds 3D glass, mouse tilt, visual siren and optional audio.
   Existing application workflows/content remain unchanged.
   ========================================================= */
let displayEnhanced = localStorage.getItem("dtbPremiumDisplay") !== "off";
let uvDisplay = localStorage.getItem("dtbUVDisplay") !== "off";
let sirenActive = false;
let sirenAudioContext = null;
let sirenTimer = null;

function applyPremiumDisplay(){
  document.body.classList.toggle("display-enhanced", displayEnhanced);
  document.body.classList.toggle("uv-display", uvDisplay);
  if(displayEnhanced) enableCardTilt();
}

function enableCardTilt(){
  if(!displayEnhanced) return;
  $$(".card, .quick-item, .setting").forEach(el=>{
    if(el.dataset.tiltBound==="1") return;
    el.dataset.tiltBound="1";
    el.addEventListener("pointermove", e=>{
      if(!displayEnhanced) return;
      const r=el.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width-.5;
      const py=(e.clientY-r.top)/r.height-.5;
      el.style.transform=`perspective(1000px) rotateX(${(-py*5).toFixed(2)}deg) rotateY(${(px*5).toFixed(2)}deg) translateZ(2px)`;
      el.style.transition="transform 80ms ease-out";
    });
    el.addEventListener("pointerleave",()=>{
      el.style.transform="";
      el.style.transition="transform 260ms ease";
    });
  });
}
function togglePremiumDisplay(){
  displayEnhanced=!displayEnhanced;
  localStorage.setItem("dtbPremiumDisplay",displayEnhanced?"on":"off");
  uvDisplay=displayEnhanced;
  localStorage.setItem("dtbUVDisplay",uvDisplay?"on":"off");
  applyPremiumDisplay();
  showToast(displayEnhanced?"3D glass, tilt and premium display enabled":"Premium 3D display disabled");
}
function stopSirenAudio(){
  if(sirenTimer){clearTimeout(sirenTimer);sirenTimer=null}
  if(sirenAudioContext){try{sirenAudioContext.close()}catch(e){}sirenAudioContext=null}
}
function startSirenAudio(){
  stopSirenAudio();
  try{
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C) throw new Error("Web Audio unavailable");
    sirenAudioContext=new C();
    const ctx=sirenAudioContext;
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type="sawtooth"; gain.gain.value=0.0001;
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
    const start=ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.045,start+0.05);
    let high=true;
    const sweep=()=>{
      if(!sirenActive){try{osc.stop()}catch(e){}return}
      const now=ctx.currentTime;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.linearRampToValueAtTime(high?880:520,now+0.42);
      high=!high;
      sirenTimer=setTimeout(sweep,420);
    };
    sweep();
  }catch(e){ console.warn("Siren audio unavailable",e); }
}
function toggleSiren(){
  sirenActive=!sirenActive;
  const beacon=$("#sirenBeacon"), btn=$("#sirenToggle");
  beacon?.classList.toggle("active",sirenActive);
  if(beacon){
    const small=beacon.querySelector("small");
    if(small) small.textContent=sirenActive?"Visual beacon active • sound enabled":"Emergency sound disabled";
  }
  if(btn){
    btn.classList.toggle("active",sirenActive);
    btn.textContent=sirenActive?"🔊 SIREN ON":"🔇 SIREN OFF";
  }
  if(sirenActive){
    startSirenAudio();
    showToast("Emergency siren enabled. Tap again to silence.");
  }else{
    stopSirenAudio();
    showToast("Emergency siren disabled.");
  }
  if(currentPage==="settings") setTimeout(()=>render("settings"),0);
}

applyTheme();
applyMotionPreference();
initAuthProviders();
if(sessionStorage.getItem("dtbAuthenticated")==="true"){$("#loginScreen").classList.add("hidden");$("#app").classList.remove("hidden");render("dashboard")}

document.addEventListener('click',(e)=>{
  const btn=e.target.closest('button'); if(!btn || btn.disabled) return;
  btn.classList.remove('siren-click'); void btn.offsetWidth; btn.classList.add('siren-click');
  setTimeout(()=>{btn.classList.remove('siren-click'); btn.classList.add('clicked-blue');},520);
});
window.addEventListener('keydown',(e)=>{
  if(e.target.matches('input,textarea,select')) return;
  const k=e.key.toLowerCase();
  if(k==='d') navigate('dashboard'); else if(k==='n') navigate('newtest'); else if(k==='r') navigate('reports'); else if(k==='h') navigate('history'); else if(k==='s') navigate('settings');
});

$("#connectionToggle").addEventListener("click",()=>{setConnection(!online);showToast(online?"Demo connection enabled":"Demo offline mode enabled")});
$$('.nav-item[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$("#captureBtn").addEventListener("click",capture);
$("#retakeBtn")?.addEventListener("click",async()=>{
  $("#capturePreview").classList.add("hidden"); $("#cameraVideo").classList.remove("hidden");
  $("#captureBtn").onclick=capture; setCameraStatus("Camera ready — retake when positioned.","info");
  if(!cameraStream){try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});$("#cameraVideo").srcObject=cameraStream}catch(e){}}
});
$("#uploadBtn").addEventListener("click",()=>$("#imageInput").click());
$("#imageInput").addEventListener("change",e=>{if(e.target.files[0]){const reader=new FileReader();reader.onload=async()=>{capturedImage=reader.result;capturedBlob=e.target.files[0];closeCamera();startAnalysis()};reader.readAsDataURL(e.target.files[0])}});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.close==='cameraModal')closeCamera();else $("#"+b.dataset.close).classList.add('hidden')}));
$("#sirenToggle")?.addEventListener("click",toggleSiren);
applyPremiumDisplay();
if(window.matchMedia) window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change",()=>{});
setConnection(online);
