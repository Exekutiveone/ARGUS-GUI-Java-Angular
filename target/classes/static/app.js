/********************
 * CONFIG (Frontend-only)
 ********************/
const STORAGE_KEY = 'dbwebgui.baseUrl';
const CONFIG = {
  // Basis-URL der API (aus LocalStorage, sonst aktueller Host)
  get BASE(){ return localStorage.getItem(STORAGE_KEY) || location.origin; },
  EP: {
    // Endpunkte für API-Aufrufe
    upload:  (db) => `/api/db/${db}/upload`,
    download:(db) => `/api/db/${db}/download`,
    relocate:(from,to) => `/api/admin/relocate?from=${from}&to=${to}`,
    sync:    (db) => `/api/admin/sync?db=${db}`,
    data:    (db, params = {}) => {
      // optionaler Filter/Limit in Query-Params
      const qs = new URLSearchParams();
      if (params.filter) qs.set('filter', params.filter);
      if (params.limit) qs.set('limit', params.limit);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return `/api/db/${db}/data${suffix}`;
    },
    schema:  (db) => `/api/db/${db}/schema`,
    clear:   (db) => `/api/db/${db}/clear`,
    clearAll: '/api/db/clear-all'
  },
  headers: () => ({ /* z.B. Authorization-Header hier einfügen */ })
};

// UI-Init für Base-URL
const baseInput = document.getElementById('baseUrlInput');
const activeBase = document.getElementById('activeBase');
const saveBase = document.getElementById('saveBase');
function refreshBase(){ activeBase.textContent = CONFIG.BASE; baseInput.value = CONFIG.BASE; }
refreshBase();
saveBase.onclick = () => {
  // Base-URL im Browser speichern
  localStorage.setItem(STORAGE_KEY, baseInput.value.trim() || location.origin);
  refreshBase();
  toast('Base URL gespeichert');
};

// Helpers
const $ = (id) => document.getElementById(id);
// Byte-Formatierung für Größenanzeige
const fmtBytes = (n) => {
  if (!n && n !== 0) return '�';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.max(0, Math.floor(Math.log(n)/Math.log(1024)));
  return `${(n/Math.pow(1024,i)).toFixed(1)} ${u[i]}`;
};
// Fortschrittsbalken aktualisieren
function setProgress(elBar, elInfo, loaded, total) {
  let pct = 0; if (total && total > 0) pct = Math.round((loaded/total)*100);
  elBar.style.width = (pct || 5) + '%';
  elInfo.textContent = total ? `${pct}%  (${fmtBytes(loaded)} / ${fmtBytes(total)})` : `${fmtBytes(loaded)} geladen�`;
}
// Toast-Meldungen anzeigen
function toast(msg, ok=true){
  const n = document.createElement('div');
  n.textContent = msg;
  n.style.position='fixed'; n.style.right='16px'; n.style.bottom='16px'; n.style.padding='10px 12px';
  n.style.background = ok ? '#064e3b' : '#3b0a0a';
  n.style.border = '1px solid #1f2937'; n.style.borderRadius='10px'; n.style.color = '#e5e7eb';
  n.style.boxShadow='0 10px 30px rgba(0,0,0,.35)';
  document.body.appendChild(n);
  setTimeout(()=> n.remove(), 2500);
}
// Standard-Header zusammenbauen
function buildHeaders(extra = {}) {
  return Object.assign({}, CONFIG.headers(), extra);
}

// Upload mit XHR (damit Fortschritt sichtbar ist)
$('btnUpload').onclick = () => {
  const file = $('fileInput').files[0];
  if (!file) return toast('Bitte Datei auswählen', false);
  const db = $('dbSelect').value;
  const url = CONFIG.EP.upload(db);

  const fd = new FormData();
  fd.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', CONFIG.BASE + url);
  Object.entries(buildHeaders()).forEach(([k,v])=> xhr.setRequestHeader(k,v));
  xhr.upload.onprogress = (e) => setProgress($('uploadBar'), $('uploadInfo'), e.loaded, e.total);
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) toast('Upload erfolgreich');
    else toast('Upload fehlgeschlagen: ' + xhr.status, false);
    setProgress($('uploadBar'), $('uploadInfo'), 0, 0);
    $('uploadBar').style.width = '0%'; $('uploadInfo').textContent='0%';
  };
  xhr.onerror = () => { toast('Netzwerkfehler beim Upload', false); };
  xhr.send(fd);
};

// Download mit XHR (Blob + Fortschritt)
$('btnDownload').onclick = () => {
  const db = $('dbSelect').value;
  const url = CONFIG.EP.download(db);
  const xhr = new XMLHttpRequest();
  xhr.open('GET', CONFIG.BASE + url);
  xhr.responseType = 'blob';
  Object.entries(buildHeaders()).forEach(([k,v])=> xhr.setRequestHeader(k,v));
  xhr.onprogress = (e) => setProgress($('downloadBar'), $('downloadInfo'), e.loaded, e.total || 0);
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      // Datei herunterladen
      const blob = xhr.response;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `export-${db}.bin`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      toast('Download bereit');
    } else {
      toast('Download fehlgeschlagen: ' + xhr.status, false);
    }
    setProgress($('downloadBar'), $('downloadInfo'), 0, 0);
    $('downloadBar').style.width='0%'; $('downloadInfo').textContent='0%';
  };
  xhr.onerror = () => toast('Netzwerkfehler beim Download', false);
  xhr.send();
};

// Relocate & Sync (Platzhalter)
$('btnRelocate').onclick = async () => {
  const from = $('relFrom').value, to = $('relTo').value;
  if (from === to) return toast('Quelle und Ziel müssen unterschiedlich sein', false);
  try {
    const res = await fetch(CONFIG.BASE + CONFIG.EP.relocate(from,to), { method:'POST', headers: buildHeaders() });
    const msg = await res.text();
    $('opsInfo').textContent = `Relocate: ${res.status} ${msg || ''}`;
    toast(res.ok ? 'Relocate OK' : 'Relocate Fehler', res.ok);
  } catch {
    toast('Relocate Netzwerkfehler', false);
  }
};
$('btnSync').onclick = async () => {
  const db = $('dbSelect').value;
  try {
    const res = await fetch(CONFIG.BASE + CONFIG.EP.sync(db), { method:'POST', headers: buildHeaders() });
    const msg = await res.text();
    $('opsInfo').textContent = `Sync: ${res.status} ${msg || ''}`;
    toast(res.ok ? 'Sync OK' : 'Sync Fehler', res.ok);
  } catch {
    toast('Sync Netzwerkfehler', false);
  }
};

// Daten laden & anzeigen
let lastData = [];
// Vorschau der Schema-Daten
function renderSchemaPreview(rows) {
  const el = $('schemaDataOutput');
  if (!el) return;
  if (!rows || !rows.length) {
    el.textContent = 'Keine Daten vorhanden.';
    return;
  }
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const header = cols.join(' | ');
  const lines = rows.slice(0, 5).map(row => cols.map(c => String(row[c] ?? '')).join(' | '));
  el.textContent = [header].concat(lines).join('\n');
}
// Tabelle rendern
function renderTable(rows){
  const tbl = $('dataTable');
  tbl.innerHTML = '';
  if (!rows || !rows.length) {
    tbl.innerHTML = '<tr><td class="muted">Keine Daten</td></tr>';
    $('stats').textContent = '0 Zeilen';
    renderSchemaPreview([]);
    return;
  }
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr>';
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = cols.map(c=>`<td>${String(r[c] ?? '')}</td>`).join('');
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  $('stats').textContent = `${rows.length} Zeilen • ${cols.length} Spalten`;
  renderSchemaPreview(rows);
}
// Button: Daten laden
$('btnLoadData').onclick = async () => {
  const db = $('dbSelect').value;
  const filter = $('filterText').value.trim();
  try {
    const url = CONFIG.EP.data(db, { filter: filter || undefined });
    const res = await fetch(CONFIG.BASE + url, { headers: buildHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    lastData = Array.isArray(data) ? data : [];
    renderTable(lastData);
    toast('Daten geladen');
  } catch {
    toast('Fehler beim Laden der Daten', false);
  }
};

// Schema-Infos anzeigen
function renderSchemaInfo(schema) {
  const el = $('schemaOutput');
  if (!el) return;
  if (!Array.isArray(schema) || !schema.length) {
    el.textContent = 'Kein Schema gefunden.';
    return;
  }
  const lines = [];
  for (const entry of schema) {
    const tableName = entry.table || entry.name || 'telemetry';
    lines.push(`Tabelle: ${tableName}`);
    const columns = Array.isArray(entry.columns) ? entry.columns : [];
    // Fallback wenn keine Spaltenliste da ist
    if (!columns.length && entry.name && entry.type) {
      lines.push(`  • ${entry.name} ${entry.type}`);
    }
    for (const col of columns) {
      const colName = col.name ?? '(ohne Name)';
      const type = col.type ? ` ${col.type}` : '';
      const notNull = Number(col.notnull) === 1 ? ' NOT NULL' : (col.is_nullable === 'NO' ? ' NOT NULL' : '');
      const pk = Number(col.pk) === 1 ? ' PRIMARY KEY' : '';
      const defaultVal = col.dflt_value !== null && col.dflt_value !== undefined && col.dflt_value !== ''
        ? ` DEFAULT ${col.dflt_value}`
        : '';
      lines.push(`  • ${colName}${type}${notNull}${pk}${defaultVal}`);
    }
    const ddl = entry.createSql || entry.sql;
    if (ddl) {
      lines.push(`  SQL: ${ddl}`);
    }
    lines.push('');
  }
  el.textContent = lines.join('\n').trim();
}
// Button: Schema laden
$('btnLoadSchema').onclick = async () => {
  const db = $('dbSelect').value;
  const el = $('schemaOutput');
  if (el) el.textContent = 'Schema wird geladen…';
  try {
    const schemaRes = await fetch(CONFIG.BASE + CONFIG.EP.schema(db), { headers: buildHeaders() });
    if (!schemaRes.ok) throw new Error('HTTP ' + schemaRes.status);
    const schema = await schemaRes.json();
    renderSchemaInfo(schema);
    // Preview-Daten laden
    try {
      const previewRes = await fetch(CONFIG.BASE + CONFIG.EP.data(db, { limit: 5 }), { headers: buildHeaders() });
      if (previewRes.ok) {
        const preview = await previewRes.json();
        renderSchemaPreview(Array.isArray(preview) ? preview : []);
      } else {
        renderSchemaPreview([]);
      }
    } catch {
      renderSchemaPreview([]);
    }
    toast('Schema geladen');
  } catch {
    if (el) el.textContent = 'Schema konnte nicht geladen werden.';
    renderSchemaPreview([]);
    toast('Fehler beim Laden des Schemas', false);
  }
};

// CSV Export aus geladenen Daten
$('btnExport').onclick = () => {
  if (!lastData.length) return toast('Keine Daten zum Export', false);
  const cols = [...new Set(lastData.flatMap(r => Object.keys(r)))];
  const lines = [cols.join(',')];
  for (const r of lastData) lines.push(cols.map(c=>JSON.stringify(r[c] ?? '')).join(','));
  const blob = new Blob([lines.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'export.csv'; a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
};

// Daten löschen
$('btnClearSelected').onclick = async () => {
  const db = $('dbSelect').value;
  if (!window.confirm(`Alle Telemetriedaten in "${db}" löschen?`)) return;
  try {
    const res = await fetch(CONFIG.BASE + CONFIG.EP.clear(db), { method:'POST', headers: buildHeaders() });
    const payload = res.ok ? await res.json() : null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    $('clearInfo').textContent = `Cleared ${payload.rowsDeleted ?? 0} rows in ${payload.target}`;
    toast('Telemetriedaten gelöscht');
    lastData = [];
    renderTable([]);
  } catch (err) {
    $('clearInfo').textContent = 'Löschen fehlgeschlagen.';
    toast('Fehler beim Löschen', false);
  }
};
$('btnClearAll').onclick = async () => {
  if (!window.confirm('Wirklich alle Telemetriedaten in allen Datenbanken löschen?')) return;
  try {
    const res = await fetch(CONFIG.BASE + CONFIG.EP.clearAll, { method:'POST', headers: buildHeaders() });
    const payload = res.ok ? await res.json() : null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const parts = payload.targets ? Object.entries(payload.targets).map(([k,v]) => `${k}: ${v}`).join(', ') : '';
    $('clearInfo').textContent = `Cleared telemetry rows → ${parts}`;
    toast('Alle Telemetriedaten gelöscht');
    lastData = [];
    renderTable([]);
  } catch {
    $('clearInfo').textContent = 'Löschen aller Daten fehlgeschlagen.';
    toast('Fehler beim Löschen (alle)', false);
  }
};

// Hinweis bei Cross-Origin (CORS)
if (new URL(CONFIG.BASE, location.href).origin !== location.origin) {
  toast('Hinweis: CORS im Backend freischalten (Origin erlauben)');
}