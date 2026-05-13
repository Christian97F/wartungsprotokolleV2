// ============================================================
// app.js – Haupt-Einstiegspunkt der PWA
//
// Hier werden alle Module zusammengebracht:
//   – Screen-Routing (welcher Bildschirm ist aktiv?)
//   – Aggregat-Liste auf dem Home-Screen
//   – Import/Export-Seite
//   – Gemeinsame Hilfsfunktionen (toast, confirm2, navigiereZu)
//
// Die Datei wird als erstes geladen und initialisiert die App.
// ============================================================

import { DB }                                     from './db.js';
import { importJSON, exportAlleAggregate }         from './io.js';
import {
  zeigeKonfigurator,
  konfigurationSpeichern,
  konfigurationExportieren,
  konfigurationLoeschen,
  einrichtenKonfiguratorTabs
} from './konfigurator.js';
import {
  zeigeProtokollFormular,
  protokollSpeichern,
  protokollExportieren,
  getAktuelleAggregat
} from './protokoll.js';
import { zeigeEintraege, alleProtokollExportieren } from './eintraege.js';

// ── Screen-Namen und -Elemente ─────────────────────────────────
const SCREENS = ['screen-home', 'screen-konfigurator', 'screen-protokoll',
                 'screen-eintraege', 'screen-io'];

let aktuellerScreen = null;
let _navFromConfig = false; // Flag: nach Konfig-Speichern zurück zur Einträge-Liste

// ── Screen wechseln ────────────────────────────────────────────
// screenId = ID des Ziel-Screens (z.B. 'screen-home')
// params   = optionale Parameter (z.B. { aggregatId: '...' })
export function navigiereZu(screenId, params = {}) {
  // Alten Screen ausblenden
  if (aktuellerScreen) {
    document.getElementById(aktuellerScreen)?.classList.remove('active');
  }

  // Neuen Screen einblenden
  const el = document.getElementById(screenId);
  if (!el) { console.error('Screen nicht gefunden:', screenId); return; }
  el.classList.add('active');
  aktuellerScreen = screenId;

  // Navigation-Buttons aktualisieren
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screenId);
  });

  // Header-Zustand anpassen
  const hatZurueck = ['screen-konfigurator', 'screen-protokoll'].includes(screenId);
  document.getElementById('btn-back').classList.toggle('visible', hatZurueck);

  // Default-Titel & Mode-Badge (je nach Screen)
  const titel = {
    'screen-home':         '⚡ Notstrom Wartung',
    'screen-konfigurator': 'Konfigurator',
    'screen-protokoll':    'Protokoll',
    'screen-eintraege':    '📁 Protokolle',
    'screen-io':           '⇅ Import / Export',
  };
  document.getElementById('screen-title-text').textContent = titel[screenId] || '';

  const mode = {
    'screen-home':         '',
    'screen-konfigurator': 'config',
    'screen-protokoll':    'protokoll',
    'screen-eintraege':    '',
    'screen-io':           '',
  };
  const newMode = mode[screenId] || '';
  document.documentElement.dataset.mode = newMode;
  const badge = document.getElementById('mode-badge');
  if (badge) {
    badge.textContent = newMode === 'config'    ? '⚙ KONFIGURATION' :
                        newMode === 'protokoll' ? '📋 PROTOKOLL' : '';
    badge.classList.toggle('visible', !!newMode);
  }

  // Header-Aktionen ein-/ausblenden
  document.getElementById('header-actions-home').style.display        = screenId === 'screen-home'         ? '' : 'none';
  document.getElementById('header-actions-konfig').style.display      = screenId === 'screen-konfigurator' ? '' : 'none';
  document.getElementById('header-actions-protokoll').style.display   = screenId === 'screen-protokoll'    ? '' : 'none';
  document.getElementById('header-actions-eintraege').style.display   = screenId === 'screen-eintraege'    ? '' : 'none';

  // FAB-Button nur auf Home-Screen zeigen
  const fab = document.getElementById('btn-neu-aggregat');
  if (fab) fab.style.display = screenId === 'screen-home' ? '' : 'none';

  // Screen-Handler aufrufen
  switch (screenId) {
    case 'screen-home':
      ladeAggregateHeim();
      break;
    case 'screen-konfigurator':
      zeigeKonfigurator(params.aggregatId || null);
      break;
    case 'screen-protokoll':
      zeigeProtokollFormular(params.aggregatId, params.protokollId || null);
      break;
    case 'screen-eintraege':
      zeigeEintraege();
      break;
    case 'screen-io':
      // Keine weiteren Aktionen nötig
      break;
  }
}

// ── Aggregat-Liste (Home-Screen) laden ─────────────────────────
async function ladeAggregateHeim() {
  const container = document.getElementById('home-aggregat-liste');
  const leerHinweis = document.getElementById('home-leer-hinweis');
  container.innerHTML = '<p class="loading-hint">Lade…</p>';

  const alle = await DB.alleAggregate();

  // Sortieren: nach Kommission
  alle.sort((a, b) =>
    (a.stammdaten?.Kommission || '').localeCompare(b.stammdaten?.Kommission || ''));

  // Suchbegriff beachten
  const suchtext = document.getElementById('home-suche')?.value?.toLowerCase() || '';
  const gefiltert = suchtext
    ? alle.filter(a =>
        (a.stammdaten?.Kommission || '').toLowerCase().includes(suchtext) ||
        (a.stammdaten?.Bezeichnung || '').toLowerCase().includes(suchtext) ||
        (a.stammdaten?.Hersteller || '').toLowerCase().includes(suchtext))
    : alle;

  if (!gefiltert.length) {
    container.innerHTML = '';
    leerHinweis.style.display = alle.length === 0 ? 'block' : 'none';
    if (alle.length > 0) {
      container.innerHTML = '<p class="empty-hint">Keine Aggregate gefunden.</p>';
    }
    return;
  }

  leerHinweis.style.display = 'none';

  container.innerHTML = gefiltert.map(a => {
    const std  = a.stammdaten || {};
    const cfg  = a.protokoll_config || {};
    const ivl  = a.wartungsintervalle || {};

    const leistung  = std.Leistung_kVA ? `${std.Leistung_kVA} kVA` : '';
    const hersteller = std.Hersteller   ? `${std.Hersteller}` : '';
    const typ        = std.Typ          ? ` ${std.Typ}` : '';
    const vertrag    = std.Wartungsvertrag
      ? '<span class="badge badge-success" style="font-size:0.72rem">Wartungsvertrag</span>'
      : '';

    return `
      <div class="aggregat-card">
        <div class="agg-icon">⚡</div>
        <div class="agg-info">
          <div class="agg-kommission">${std.Kommission || '(keine Kommission)'}</div>
          <div class="agg-name">${std.Bezeichnung || '–'}</div>
          <div class="agg-meta">
            ${hersteller}${typ}${leistung ? ' · ' + leistung : ''}
          </div>
          <div style="margin-top:4px">${vertrag}</div>
        </div>
        <div class="agg-actions">
          <button class="btn btn-primary btn-sm" data-action="protokoll" data-id="${a.id}">
            📋 Protokoll
          </button>
          <button class="btn btn-ghost btn-sm"  data-action="bearbeiten" data-id="${a.id}">
            ⚙ Bearbeiten
          </button>
          <button class="btn btn-danger btn-sm" data-action="loeschen"  data-id="${a.id}"
                  data-name="${std.Kommission || a.id}">
            ✕
          </button>
        </div>
      </div>`;
  }).join('');

  // Event-Listener
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name || id;

      switch (btn.dataset.action) {
        case 'protokoll':
          navigiereZu('screen-protokoll', { aggregatId: id });
          break;
        case 'bearbeiten':
          navigiereZu('screen-konfigurator', { aggregatId: id });
          break;
        case 'loeschen':
          if (await confirm2(`Aggregat "${name}" wirklich löschen?\nAlle Protokolle bleiben erhalten.`)) {
            await DB.loescheAggregat(id);
            toast(`"${name}" gelöscht`);
            ladeAggregateHeim();
          }
          break;
      }
    });
  });
}

// ── Zurück-Navigation ──────────────────────────────────────────
async function zurueck() {
  if (aktuellerScreen === 'screen-protokoll') {
    const auswahl = await confirmCustom(
      'Protokoll als Entwurf speichern?',
      [
        { label: '💾 Als Entwurf speichern', className: 'btn btn-primary', wert: 'speichern' },
        { label: '✕ Verwerfen', className: 'btn btn-danger', wert: 'verwerfen' },
        { label: 'Abbrechen', className: 'btn btn-secondary', wert: 'abbrechen' },
      ]
    );
    if (!auswahl || auswahl === 'abbrechen') return;
    if (auswahl === 'speichern') {
      const ok = await protokollSpeichern(false);
      if (!ok) return;
    }
    _navFromConfig = false;
    navigiereZu('screen-home');
    return;
  }

  if (aktuellerScreen === 'screen-konfigurator') {
    const auswahl = await confirmCustom(
      'Konfiguration speichern?',
      [
        { label: '💾 Speichern', className: 'btn btn-primary', wert: 'speichern' },
        { label: '✕ Verwerfen', className: 'btn btn-danger', wert: 'verwerfen' },
        { label: 'Abbrechen', className: 'btn btn-secondary', wert: 'abbrechen' },
      ]
    );
    if (!auswahl || auswahl === 'abbrechen') return;
    if (auswahl === 'speichern') {
      const ok = await konfigurationSpeichern();
      if (!ok) return;
    }
    if (_navFromConfig) {
      _navFromConfig = false;
      navigiereZu('screen-eintraege');
      return;
    }
    navigiereZu('screen-home');
    return;
  }

  navigiereZu('screen-home');
}

// ── Toast-Benachrichtigung anzeigen ───────────────────────────
// Wird von allen Modulen verwendet (daher exportiert)
export function toast(nachricht, typ = 'info') {
  const el       = document.createElement('div');
  el.className   = `toast toast-${typ}`;
  el.textContent = nachricht;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Aktuelle confirm-resolve-Funktion (für Overlay-Klick) ──────
let _confirmResolve = null;

// ── Flexibler Bestätigungs-Dialog ───────────────────────────────
// optionen = [{ label, className, wert }]
// Gibt Promise zurück, das mit dem wert der geklickten Option resolved
export function confirmCustom(nachricht, optionen) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = nachricht;
    const group = document.getElementById('confirm-buttons');
    group.innerHTML = '';

    optionen.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = opt.className || 'btn btn-secondary';
      btn.textContent = opt.label;
      btn.onclick = () => {
        overlay.classList.remove('visible');
        group.innerHTML = '';
        _confirmResolve = null;
        resolve(opt.wert);
      };
      group.appendChild(btn);
    });

    overlay.classList.add('visible');
  });
}

// Einfache Ja/Nein-Variante (bisherige confirm2)
export function confirm2(nachricht) {
  return confirmCustom(nachricht, [
    { label: 'Ja', className: 'btn btn-danger', wert: true },
    { label: 'Abbrechen', className: 'btn btn-secondary', wert: false },
  ]);
}

// ── Import-Handler ─────────────────────────────────────────────
async function handleImport(datei) {
  try {
    const ergebnis = await importJSON(datei);
    toast(ergebnis.meldung, 'success');

    // Falls Aggregate importiert wurden, Liste neu laden
    if (ergebnis.typ === 'aggregat' || ergebnis.typ === 'aggregat-sammlung') {
      if (aktuellerScreen === 'screen-home') ladeAggregateHeim();
    }
    if (ergebnis.typ === 'protokoll' || ergebnis.typ === 'protokoll-sammlung') {
      if (aktuellerScreen === 'screen-eintraege') zeigeEintraege();
    }
  } catch (err) {
    toast('Import fehlgeschlagen: ' + err.message, 'error');
  }
}

// ── App initialisieren ─────────────────────────────────────────
function init() {
  // Service Worker registrieren (für Offline-Unterstützung)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker registriert'))
      .catch(err => console.warn('Service Worker Fehler:', err));
  }

  // ── Bottom-Navigation ──────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigiereZu(btn.dataset.screen));
  });

  // ── Header-Buttons ─────────────────────────────────────────
  document.getElementById('btn-back').addEventListener('click', zurueck);

  // ── Home: Neues Aggregat ────────────────────────────────────
  document.getElementById('btn-neu-aggregat')?.addEventListener('click', () => {
    navigiereZu('screen-konfigurator', {});
  });

  // ── Home: Suche ────────────────────────────────────────────
  document.getElementById('home-suche')?.addEventListener('input', () => {
    ladeAggregateHeim();
  });

  // ── Konfigurator: Tabs ─────────────────────────────────────
  einrichtenKonfiguratorTabs();

  // ── Konfigurator: Speichern ────────────────────────────────
  document.getElementById('btn-kfg-speichern')?.addEventListener('click', async () => {
    const ok = await konfigurationSpeichern();
    if (ok) {
      if (_navFromConfig) {
        _navFromConfig = false;
        navigiereZu('screen-eintraege');
        return;
      }
      navigiereZu('screen-home');
    }
  });

  // ── Konfigurator: Exportieren ──────────────────────────────
  document.getElementById('btn-kfg-exportieren')?.addEventListener('click', async () => {
    await konfigurationExportieren();
  });

  // ── Konfigurator: Löschen ──────────────────────────────────
  document.getElementById('btn-kfg-loeschen')?.addEventListener('click', async () => {
    await konfigurationLoeschen();
  });

  // ── Protokoll: Config bearbeiten → Konfigurator ──────────
  document.getElementById('btn-prot-config')?.addEventListener('click', async () => {
    const agg = getAktuelleAggregat();
    if (!agg?.id) { toast('Kein Aggregat geladen', 'error'); return; }
    const ok = await protokollSpeichern(false);
    if (!ok) return;
    _navFromConfig = true;
    navigiereZu('screen-konfigurator', { aggregatId: agg.id });
  });

  // ── Protokoll: Als Entwurf speichern ──────────────────────
  document.getElementById('btn-prot-entwurf')?.addEventListener('click', async () => {
    const ok = await protokollSpeichern(false);
    if (ok) navigiereZu('screen-eintraege');
  });

  // ── Protokoll: Abschließen ─────────────────────────────────
  document.getElementById('btn-prot-abschliessen')?.addEventListener('click', async () => {
    const ok = await protokollSpeichern(true);
    if (ok) navigiereZu('screen-eintraege');
  });

  // ── Protokoll: Exportieren ─────────────────────────────────
  document.getElementById('btn-prot-exportieren')?.addEventListener('click', async () => {
    await protokollExportieren();
  });

  // ── Einträge: Alle exportieren ─────────────────────────────
  document.getElementById('btn-alle-prot-export')?.addEventListener('click', async () => {
    await alleProtokollExportieren();
  });

  // ── Import/Export-Seite ────────────────────────────────────
  // Import-Buttons (Datei auswählen)
  document.getElementById('btn-import-aggregat')?.addEventListener('click', () => {
    document.getElementById('input-import-aggregat').click();
  });
  document.getElementById('btn-import-protokoll')?.addEventListener('click', () => {
    document.getElementById('input-import-protokoll').click();
  });

  // Datei-Input-Handler
  ['input-import-aggregat', 'input-import-protokoll'].forEach(inputId => {
    document.getElementById(inputId)?.addEventListener('change', e => {
      const datei = e.target.files?.[0];
      if (datei) handleImport(datei);
      e.target.value = ''; // Reset damit gleiche Datei nochmals importiert werden kann
    });
  });

  // Export-Buttons auf der IO-Seite
  document.getElementById('btn-export-alle-aggregat')?.addEventListener('click', async () => {
    try {
      const anzahl = await exportAlleAggregate();
      toast(`${anzahl} Aggregat(e) exportiert`, 'success');
    } catch (err) {
      toast('Export fehlgeschlagen: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-export-alle-protokoll')?.addEventListener('click', async () => {
    await alleProtokollExportieren();
  });

  // ── Theme (Hell/Dunkel) aus localStorage wiederherstellen ─
  const savedTheme = localStorage.getItem('notstrom-theme');
  if (savedTheme === 'light') {
    document.documentElement.dataset.theme = 'light';
    document.getElementById('btn-theme').textContent = '☀️';
  }

  // ── Theme-Toggle ────────────────────────────────────────────
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    const root = document.documentElement;
    const isLight = root.dataset.theme === 'light';
    root.dataset.theme = isLight ? '' : 'light';
    localStorage.setItem('notstrom-theme', isLight ? '' : 'light');
    document.getElementById('btn-theme').textContent = isLight ? '🌙' : '☀️';
  });

  // ── Bestätigungs-Dialog: Schließen mit Klick auf Overlay ──
  document.getElementById('confirm-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('visible');
      if (_confirmResolve) {
        const resolve = _confirmResolve;
        _confirmResolve = null;
        resolve(null);
      }
    }
  });

  // ── 404.html-Redirect aufräumen (GitHub Pages SPA-Fallback) ─
  if (sessionStorage.redirect) {
    sessionStorage.removeItem('redirect');
  }

  // ── Start: Home-Screen anzeigen ────────────────────────────
  navigiereZu('screen-home');
}

// Starten sobald der Browser bereit ist
document.addEventListener('DOMContentLoaded', init);
