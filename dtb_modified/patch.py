from pathlib import Path
p=Path('/mnt/data/fcwork/DTB_Drug_Testing_Buddy')
html=(p/'index.html').read_text()
html=html.replace('<button class="nav-item" data-page="guide"><i>?</i>Field Guide</button>','<button class="nav-item" data-page="guide"><i>?</i>Field Guide</button>\n        <button class="nav-item" data-page="settings"><i>⚙</i>Settings</button>')
(p/'index.html').write_text(html)

js=(p/'script.js').read_text()
# insert settings function before profile
marker='function profile(){'
settings=r'''function settings(){
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
        <div class="section-title"><div><h4>Appearance</h4><small>Switch the dashboard between dark and light mode.</small></div><span>THEME</span></div>
        <div class="theme-choice-grid">
          <button class="theme-choice ${theme==='dark'?'selected':''}" onclick="setTheme('dark')"><span class="theme-preview dark-preview"></span><strong>Dark</strong><small>Professional navy glass</small></button>
          <button class="theme-choice ${theme==='light'?'selected':''}" onclick="setTheme('light')"><span class="theme-preview light-preview"></span><strong>Light</strong><small>Bright field workspace</small></button>
        </div>
        <div class="setting-row"><div><strong>Premium 3D glass</strong><small>Keep tilt, depth and glass highlights enabled.</small></div><button class="toggle-button ${displayEnhanced?'on':''}" onclick="toggleSetting('premium')"><span></span>${displayEnhanced?'ON':'OFF'}</button></div>
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
  localStorage.setItem('dtbTheme',theme); applyTheme(); render('settings'); showToast(theme==='light'?'Light theme enabled':'Dark theme enabled');
}
function applyTheme(){ document.documentElement.dataset.theme=localStorage.getItem('dtbTheme')||'dark'; }
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

'''
js=js.replace(marker,settings+marker)
# add settings to render map
js=js.replace('guide:["Field Guide",guide],profile:["Officer Profile",profile]', 'guide:["Field Guide",guide],settings:["Settings",settings],profile:["Officer Profile",profile]')
# apply theme/motion after vars initialization before initAuthProviders
js=js.replace('initAuthProviders();', 'applyTheme();\napplyMotionPreference();\ninitAuthProviders();')
# global click effect before connection listener
needle='$("#connectionToggle").addEventListener'
effect=r'''document.addEventListener('click',(e)=>{
  const btn=e.target.closest('button'); if(!btn || btn.disabled) return;
  btn.classList.remove('siren-click'); void btn.offsetWidth; btn.classList.add('siren-click');
  setTimeout(()=>btn.classList.remove('siren-click'),520);
});
window.addEventListener('keydown',(e)=>{
  if(e.target.matches('input,textarea,select')) return;
  const k=e.key.toLowerCase();
  if(k==='d') navigate('dashboard'); else if(k==='n') navigate('newtest'); else if(k==='r') navigate('reports'); else if(k==='h') navigate('history'); else if(k==='s') navigate('settings');
});

'''
js=js.replace(needle,effect+needle)
(p/'script.js').write_text(js)
