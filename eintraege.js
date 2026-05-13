// ============================================================
// eintraege.js – Liste der ausgefüllten Wartungsprotokolle
//
// Zeigt alle gespeicherten Protokolle an.
// Mögliche Aktionen pro Protokoll:
//   – Öffnen / Weiterbearbeiten
//   – Als JSON exportieren
//   – Löschen
// ============================================================

import { DB } from './db.js';
import { exportProtokoll, exportAlleProtokolle } from './io.js';
import { toast, confirm2, navigiereZu } from './app.js';

// ── Eintrags-Liste anzeigen ────────────────────────────────────
export async function zeigeEintraege() {
  const container = document.getElementById('eintraege-liste');
  container.innerHTML = '<p class="loading-hint">Lade…</p>';

  const alle = await DB.alleProtokolle();

  // Sortieren: Neueste zuerst
  alle.sort((a, b) => (b.erstellt_am || '').localeCompare(a.erstellt_am || ''));

  if (!alle.length) {
    container.innerHTML = `
      <p class="empty-hint">
        Noch keine Protokolle vorhanden.<br>
        Wähle ein Aggregat und klicke „Protokoll ausfüllen".
      </p>`;
    return;
  }

  // Aggregat-Daten vorladen (für Anzeige von Bezeichnung + Kommission)
  const aggregatMap = {};
  const alleAgg = await DB.alleAggregate();
  alleAgg.forEach(a => { aggregatMap[a.id] = a; });

  container.innerHTML = alle.map(e => {
    const agg      = aggregatMap[e.aggregatId];
    const kommission = agg?.stammdaten?.Kommission || e.aggregatId || '?';
    const bezeich    = agg?.stammdaten?.Bezeichnung || '';
    const datum      = e.datum || e.erstellt_am?.slice(0, 10) || '?';
    const techniker  = e.meta?.techniker || '–';
    const status     = e.status === 'abgeschlossen' ? 'abgeschlossen' : 'entwurf';
    const ergebnis   = e.ergebnis || '';

    const statusBadge = status === 'abgeschlossen'
      ? '<span class="badge badge-success">Abgeschlossen</span>'
      : '<span class="badge badge-warning">Entwurf</span>';

    const ergebnisBadge = {
      in_ordnung:    '<span class="badge badge-success">✓ In Ordnung</span>',
      fehler_behoben:'<span class="badge badge-warning">⚠ Fehler behoben</span>',
      fehler_offen:  '<span class="badge badge-danger">✗ Fehler offen</span>',
    }[ergebnis] || '';

    const maengelAnzahl = e.maengel?.length || 0;
    const maengelBadge  = maengelAnzahl > 0
      ? `<span class="badge badge-danger">${maengelAnzahl} Mängel</span>`
      : '';

    return `
      <div class="eintrag-card" data-id="${e.id}">
        <div class="eintrag-header">
          <div class="eintrag-title">
            <span class="text-mono text-accent">${kommission}</span>
            ${bezeich ? ` – ${bezeich}` : ''}
          </div>
          <div>${statusBadge}</div>
        </div>
        <div class="eintrag-meta">
          📅 ${formatDatum(datum)} &nbsp;·&nbsp;
          👤 ${techniker}
          ${e.meta?.auftrag_nr ? ` &nbsp;·&nbsp; Auftrag: ${e.meta.auftrag_nr}` : ''}
        </div>
        <div style="display:flex;gap:var(--space-xs);flex-wrap:wrap;margin-bottom:var(--space-sm)">
          ${ergebnisBadge} ${maengelBadge}
        </div>
        <div class="eintrag-actions">
          <button class="btn btn-primary btn-sm"   data-action="oeffnen"    data-id="${e.id}" data-aggid="${e.aggregatId}">Öffnen</button>
          <button class="btn btn-secondary btn-sm" data-action="exportieren" data-id="${e.id}">Export JSON</button>
          <button class="btn btn-danger btn-sm"    data-action="loeschen"    data-id="${e.id}">✕</button>
        </div>
      </div>`;
  }).join('');

  // Event-Listener für Buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.id;
      const aggId = btn.dataset.aggid;

      switch (btn.dataset.action) {
        case 'oeffnen':
          navigiereZu('screen-protokoll', { aggregatId: aggId, protokollId: id });
          break;

        case 'exportieren':
          try {
            const name = await exportProtokoll(id);
            toast(`Exportiert: ${name}`, 'success');
          } catch (err) {
            toast('Export fehlgeschlagen: ' + err.message, 'error');
          }
          break;

        case 'loeschen':
          if (await confirm2('Dieses Protokoll wirklich löschen?\nDie Daten gehen verloren.')) {
            await DB.loescheProtokoll(id);
            toast('Protokoll gelöscht');
            zeigeEintraege(); // Liste neu laden
          }
          break;
      }
    });
  });
}

// ── Alle Protokolle exportieren ────────────────────────────────
export async function alleProtokollExportieren() {
  try {
    const anzahl = await exportAlleProtokolle();
    toast(`${anzahl} Protokoll(e) exportiert`, 'success');
  } catch (err) {
    toast('Export fehlgeschlagen: ' + err.message, 'error');
  }
}

// ── Datum formatieren ──────────────────────────────────────────
function formatDatum(isoStr) {
  if (!isoStr) return '–';
  try {
    return new Date(isoStr).toLocaleDateString('de-DE', {
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric'
    });
  } catch {
    return isoStr;
  }
}
