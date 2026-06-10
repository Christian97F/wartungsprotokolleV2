// ============================================================
// io.js – Import und Export von JSON-Dateien
//
// Die App arbeitet ohne Internet. Daten werden als JSON-Dateien
// aus- und eingelesen (z.B. über Google Drive, USB, E-Mail).
//
// Export: JSON-Datei wird automatisch heruntergeladen
// Import: Datei auswählen → Daten werden in die DB geladen
// ============================================================

import { DB, erzeugId } from './db.js';

// ── JSON-Datei herunterladen ───────────────────────────────────
// filename = Dateiname (z.B. "Aggregat_26-00034.json")
// data     = JavaScript-Objekt, wird zu JSON konvertiert
export function downloadJSON(filename, data) {
  const json = JSON.stringify(data, null, 2);  // 2 Spaces Einrückung
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.click();

  // URL-Objekt wieder freigeben
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Aggregat-Konfiguration exportieren ────────────────────────
export async function exportAggregat(aggregatId) {
  const aggregat = await DB.getAggregat(aggregatId);
  if (!aggregat) throw new Error('Aggregat nicht gefunden');

  const kommission = aggregat.stammdaten?.Kommission || aggregat.id;
  const datum      = new Date().toISOString().slice(0, 10);
  const filename   = `Aggregat_${kommission}_${datum}.json`;

  // Typ-Kennung mitschicken, damit der Import erkennt was es ist
  const exportDaten = {
    _typ:     'aggregat-konfiguration',
    _version: '1.0',
    ...aggregat
  };

  downloadJSON(filename, exportDaten);
  return filename;
}

// ── Alle Aggregat-Konfigurationen exportieren ──────────────────
export async function exportAlleAggregate() {
  const alle   = await DB.alleAggregate();
  const datum  = new Date().toISOString().slice(0, 10);
  const exportDaten = {
    _typ:     'aggregat-sammlung',
    _version: '1.0',
    _exportiert_am: new Date().toISOString(),
    aggregate: alle
  };
  downloadJSON(`AlleAggregate_${datum}.json`, exportDaten);
  return alle.length;
}

// ── Protokoll-Eintrag exportieren ─────────────────────────────
export async function exportProtokoll(protokollId) {
  const protokoll = await DB.getProtokoll(protokollId);
  if (!protokoll) throw new Error('Protokoll nicht gefunden');

  // Zugehörige Konfiguration mitexportieren (für spätere Protokoll-Erstellung)
  const aggregat = await DB.getAggregat(protokoll.aggregatId).catch(() => null);

  
  const saeubern   = (text) => (text || '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  const kommission = saeubern(aggregat?.stammdaten?.Kommission) || protokoll.aggregatId;
  const kunde      = saeubern(aggregat?.stammdaten?.Kunde)    || 'unbekannt';
  const standort   = saeubern(aggregat?.stammdaten?.Standort) || 'unbekannt';
  const leistung   = saeubern(aggregat?.stammdaten?.Leistung_kVA) || 'unbekannt';
  const datum      = protokoll.datum?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const filename   = `Protokoll_${kommission}_${kunde}_${standort}_${leistung}_kVA_${datum}.json`;

  const exportDaten = {
    _typ:     'wartungsprotokoll',
    _version: '1.0',
    protokoll,
    aggregat_config: aggregat || null
  };

  downloadJSON(filename, exportDaten);
  return filename;
}

// ── Alle Protokolle exportieren ────────────────────────────────
export async function exportAlleProtokolle() {
  const alle  = await DB.alleProtokolle();
  const datum = new Date().toISOString().slice(0, 10);
  const exportDaten = {
    _typ:     'protokoll-sammlung',
    _version: '1.0',
    _exportiert_am: new Date().toISOString(),
    protokolle: alle
  };
  downloadJSON(`AlleProtokolle_${datum}.json`, exportDaten);
  return alle.length;
}

// ── JSON-Datei importieren ─────────────────────────────────────
// Gibt ein Promise zurück mit { typ, anzahl, meldung }
export async function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const daten = JSON.parse(event.target.result);
        const ergebnis = await verarbeiteImport(daten);
        resolve(ergebnis);
      } catch (err) {
        reject(new Error('JSON konnte nicht gelesen werden: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsText(file, 'utf-8');
  });
}

// ── Import-Daten verarbeiten (erkennt Typ automatisch) ────────
async function verarbeiteImport(daten) {
  const typ = daten._typ;

  // ── Einzelne Aggregat-Konfiguration ─────────────────────────
  if (typ === 'aggregat-konfiguration') {
    const aggregat = { ...daten };
    delete aggregat._typ;
    delete aggregat._version;

    // Wenn keine ID vorhanden, neue erzeugen
    if (!aggregat.id) aggregat.id = erzeugId();
    aggregat.importiert_am = new Date().toISOString();

    await DB.speichereAggregat(aggregat);
    return {
      typ: 'aggregat',
      anzahl: 1,
      meldung: `Aggregat "${aggregat.stammdaten?.Kommission || aggregat.id}" importiert`
    };
  }

  // ── Sammlung von Aggregat-Konfigurationen ────────────────────
  if (typ === 'aggregat-sammlung') {
    const aggregate = daten.aggregate || [];
    for (const aggregat of aggregate) {
      if (!aggregat.id) aggregat.id = erzeugId();
      aggregat.importiert_am = new Date().toISOString();
      await DB.speichereAggregat(aggregat);
    }
    return {
      typ: 'aggregat-sammlung',
      anzahl: aggregate.length,
      meldung: `${aggregate.length} Aggregat(e) importiert`
    };
  }

  // ── Einzelnes Wartungsprotokoll ──────────────────────────────
  if (typ === 'wartungsprotokoll') {
    const protokoll = daten.protokoll;
    if (!protokoll) throw new Error('Protokoll-Daten fehlen');
    if (!protokoll.id) protokoll.id = erzeugId();
    protokoll.importiert_am = new Date().toISOString();

    await DB.speichereProtokoll(protokoll);

    // Zugehörige Konfiguration auch importieren, falls mitgeliefert
    if (daten.aggregat_config) {
      const agg = daten.aggregat_config;
      if (!agg.id) agg.id = erzeugId();
      await DB.speichereAggregat(agg);
    }

    return {
      typ: 'protokoll',
      anzahl: 1,
      meldung: `Protokoll vom ${protokoll.datum?.slice(0,10) || '?'} importiert`
    };
  }

  // ── Sammlung von Protokollen ─────────────────────────────────
  if (typ === 'protokoll-sammlung') {
    const protokolle = daten.protokolle || [];
    for (const p of protokolle) {
      if (!p.id) p.id = erzeugId();
      await DB.speichereProtokoll(p);
    }
    return {
      typ: 'protokoll-sammlung',
      anzahl: protokolle.length,
      meldung: `${protokolle.length} Protokoll(e) importiert`
    };
  }

  throw new Error(
    `Unbekanntes Import-Format (Typ: "${typ || 'unbekannt'}"). ` +
    'Bitte nur Dateien importieren, die von dieser App exportiert wurden.'
  );
}
