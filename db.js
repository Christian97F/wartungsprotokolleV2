// ============================================================
// db.js – Lokale Datenbank (IndexedDB)
//
// IndexedDB ist die Browser-eigene Offline-Datenbank.
// Hier werden zwei "Tabellen" (Object Stores) verwaltet:
//   • aggregate  → Konfigurationen der Notstromaggregate
//   • protokolle → Ausgefüllte Wartungsprotokolle
//
// Alle Funktionen sind async (geben ein Promise zurück).
// ============================================================

const DB_NAME    = 'NotstromWartungDB';
const DB_VERSION = 1;

// Interne Variable – wird nach dem ersten Öffnen wiederverwendet
let _db = null;

// ── Datenbank öffnen / initialisieren ─────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Wird nur beim ersten Aufruf oder bei einer neuen DB-Version ausgeführt
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store für Aggregat-Konfigurationen
      if (!db.objectStoreNames.contains('aggregate')) {
        const store = db.createObjectStore('aggregate', { keyPath: 'id' });
        store.createIndex('kommission', 'stammdaten.Kommission', { unique: false });
      }

      // Store für ausgefüllte Wartungsprotokolle
      if (!db.objectStoreNames.contains('protokolle')) {
        const store = db.createObjectStore('protokolle', { keyPath: 'id' });
        store.createIndex('aggregatId',  'aggregatId',  { unique: false });
        store.createIndex('datum',       'datum',        { unique: false });
        store.createIndex('status',      'status',       { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB Fehler:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ── Hilfsfunktion: Einzelne Transaktion ausführen ─────────────
// store = Name des Object Stores ('aggregate' oder 'protokolle')
// mode  = 'readonly' oder 'readwrite'
// fn    = Funktion die den Store erhält und eine IDB-Request zurückgibt
function runTransaction(store, mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, mode);
      const obj = tx.objectStore(store);
      const req = fn(obj);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  });
}

// ── Hilfsfunktion: Alle Einträge aus einem Store holen ────────
function getAll(store) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  });
}

// ── Hilfsfunktion: Alle Einträge nach Index filtern ───────────
function getAllByIndex(store, indexName, value) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).index(indexName).getAll(value);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  });
}

// ============================================================
// Öffentliche API – wird in anderen Dateien per Import genutzt
// ============================================================
export const DB = {

  // ── AGGREGATE (Konfigurationen) ─────────────────────────────

  /** Alle Aggregat-Konfigurationen laden */
  alleAggregate: () => getAll('aggregate'),

  /** Eine Konfiguration anhand der ID laden */
  getAggregat: (id) => runTransaction('aggregate', 'readonly', s => s.get(id)),

  /** Konfiguration speichern oder überschreiben (put = insert or update) */
  speichereAggregat: (aggregat) => runTransaction('aggregate', 'readwrite', s => s.put(aggregat)),

  /** Konfiguration löschen */
  loescheAggregat: (id) => runTransaction('aggregate', 'readwrite', s => s.delete(id)),

  // ── PROTOKOLLE (Ausgefüllte Wartungsprotokolle) ─────────────

  /** Alle Protokolle laden */
  alleProtokolle: () => getAll('protokolle'),

  /** Alle Protokolle für ein bestimmtes Aggregat */
  protokolleVonAggregat: (aggregatId) => getAllByIndex('protokolle', 'aggregatId', aggregatId),

  /** Ein Protokoll anhand der ID laden */
  getProtokoll: (id) => runTransaction('protokolle', 'readonly', s => s.get(id)),

  /** Protokoll speichern oder überschreiben */
  speichereProtokoll: (protokoll) => runTransaction('protokolle', 'readwrite', s => s.put(protokoll)),

  /** Protokoll löschen */
  loescheProtokoll: (id) => runTransaction('protokolle', 'readwrite', s => s.delete(id)),

  // ── HILFSFUNKTIONEN ─────────────────────────────────────────

  /** Prüft ob die Datenbank erreichbar ist */
  ping: () => openDB().then(() => true).catch(() => false),
};

// ── Standard-Konfiguration für ein neues Aggregat ─────────────
// Alle Felder mit sinnvollen Standardwerten vorbelegen,
// damit der Konfigurator immer ein vollständiges Objekt hat.
export function neuesAggregat() {
  return {
    // Eindeutige ID (wird intern genutzt, nicht die Kommission)
    id: erzeugId(),
    erstellt_am:  new Date().toISOString(),
    geaendert_am: new Date().toISOString(),

    // ── Stammdaten (aus DB-Tabelle "aggregate") ────────────────
    stammdaten: {
      Kommission:              '',
      Bezeichnung:             '',
      Hersteller:              '',
      Typ:                     '',
      Serien_NR:               '',
      Leistung_kVA:            null,
      Motor_Typ:               '',
      Motor_NR:                '',
      // Kunde und Standort – erscheinen vorausgefüllt im Protokoll
      Kunde:                   '',
      Standort:                '',
      Menge_Kuehlmittel_intern:  null,
      Typ_Kuehlmittel_intern:    '',
      Menge_Kuehlmittel_extern:  null,
      Typ_Kuehlmittel_extern:    '',
      Wartungsvertrag:           false,
      Wartungsvertrag_NR:        '',
      Wartungspauschale:         null,
      Server_Link:               '',
      Text:                      '',
    },

    // ── Wartungsintervalle (in Monaten) ───────────────────────
    wartungsintervalle: {
      Oelwechsel_Intervall:          12,
      DGUV_Intervall:                48,
      Kuehlmittel_Intervall_intern:  48,
      Kuehlmittel_Intervall_extern:  null,
      Luftfilter_Intervall:          48,
      Motorwartung_Intervall:        12,
      Elektr_Wartung_Intervall:      12,
    },

    // ── Technische Daten (aus DB-Tabelle "aggregat_technische_daten") ──
    technische_daten: {
      // Generator
      Generator_Hersteller:  '',
      Generator_Typ:         '',
      Generator_Serien_NR:   '',
      Generator_Regler_Typ:  '',
      // Motorregler
      Motorregler_Hersteller: '',
      Motorregler_Typ:        '',
      // Notstromautomatik
      NSA_Hersteller: '',
      NSA_Typ:        '',
      NSA_Serien_NR:  '',
      // Starterbatterien
      Hersteller_Starterbatterie: '',
      Spannung_Starterbatterie:   12,
      Anzahl_Starterbatterien:    2,
      Typ_Starterbatterie:        '',
      Kapazitaet_Starterbatterie: null,
      Wartungsfrei_Starterbatterie: false,
      // Steuerbatterien
      Hersteller_Steuerbatterie:  '',
      Spannung_Steuerbatterie:    12,
      Anzahl_Steuerbatterien:     0,
      Typ_Steuerbatterie:         '',
      Kapazitaet_Steuerbatterie:  null,
      Wartungsfrei_Steuerbatterie: false,
      // Batterielader
      Batterielader1_Hersteller: '',
      Batterielader1_Typ:        '',
      Batterielader2_Hersteller: '',
      Batterielader2_Typ:        '',
    },

    // ── Protokoll-Konfiguration (aus DB-Tabelle "aggregat_protokoll_config") ──
    protokoll_config: {
      Typ:              'stationaer',  // 'stationaer' oder 'mobil'
      Lastbetrieb:      '',            // z.B. 'uebergabesync', 'inselbetrieb'
      Hat_Startzaehler: false,
      Kunden_Bestellnr: '',
      Keine_DGUV:       false,

      // Liste der vorhandenen Leckageüberwachungen
      // Jeder Eintrag: { name: string, unterdruck: boolean }
      // unterdruck = true → Unterdruckleckagewächter (Vakuumsystem)
      Leckagewächter: [],

      // Liste der konfigurierten Störmeldungen
      // Jeder Eintrag: { name, typ, pruefhinweis }
      // typ: 'abstellend' | 'abstellend_verzoegert' | 'warnend'
      // pruefhinweis: z.B. "Klemme X3 7 und 8 brücken"
      Stoermeldungen: [],

      // Temperaturen / Heizung / Vorwärmung
      Temperaturen_Heizung: {
        motorvorwaermung:   { aktiv: false },  // Motorvorwärmung (+ Temperaturmessung im Protokoll)
        kraftstoffvorwaerm: { aktiv: false },  // Kraftstoffvorwärmung
        raumheizung:        { aktiv: false },  // Raumheizung
        raumtemperatur:     { aktiv: false },  // Raumtemperatur (Messung im Protokoll)
        // Außentemperatur wird immer im Protokoll erfasst (kein aktiv-Flag nötig)
        // Jalousien wurde in die Rubrik Ausstattung verschoben
      },

      // Schaltanlage – welche Elemente sind vorhanden?
      Schaltanlage: {
        hupe:         { aktiv: false },  // Signalhorn
        notaus:       { aktiv: false },  // NOT-AUS Schalter
        potfrei:      { aktiv: false },  // Potentialfreie Meldungen
        lastprobe:    { aktiv: false },  // Lastprobeschalter
        stoerungen:   { aktiv: false },  // Anzeige für Störmeldungen
        beleuchtng:   { aktiv: false },  // Beleuchtung in der Schaltanlage
		beleuchtngagg:{ aktiv: false },  // Beleuchtung Aggregat
        genschalter:  { aktiv: false },  // Generatorschalter
        netzschalter: { aktiv: false },  // Netzschalter
        ueberwachung: { aktiv: false },  // Überwachungseinrichtung
        _eigen:       [],                // Benutzerdefinierte Prüfpunkte
      },

      // Messinstrumente – welche sind vorhanden?
      Messinstrumente: {
        pf:       { aktiv: false },  // Leistungsfaktor (cos φ)
        sp:       { aktiv: false },  // Spannung
        nullsp:   { aktiv: false },  // Nullspannung
        str:      { aktiv: false },  // Strom
		umsch:    { aktiv: false },	 // Messtellenumschalter (Netz/Gen)
		umschL123:{ aktiv: false },  // Umschalter L1,L2,L3
        freq:     { aktiv: false },  // Frequenz       
        leist:    { aktiv: false },  // Leistung (kW)
        batlad:   { aktiv: false },  // Batterieladestrom
		batsp:	  { aktiv: false },  // Batterieladespannung
        kwtemp:   { aktiv: false },  // Kühlwassertemperatur
        kraftst:  { aktiv: false },  // Kraftstoffvorrat
        oeldruck: { aktiv: false },  // Öldruck
		drehz:    { aktiv: false },  // Drehzahl
        _eigen:   [],                // Benutzerdefinierte Prüfpunkte
      },

      // Generator – hat dieser einen Trenner?
      Hat_Generator_Trenner: false,

      // Generatorspannung
      Generatorspannung_Typ:  'fest',   // 'fest' oder 'variabel'
      Generatorspannung_Soll: null,     // Sollwert in Volt
      Generatorspannung_Min:  null,     // Untere Toleranz
      Generatorspannung_Max:  null,     // Obere Toleranz

      // Generatorfrequenz
      Generatorfrequenz_Typ:  'fest',   // 'fest' oder 'variabel'
      Generatorfrequenz_Soll: null,     // Sollwert in Hz
      Generatorfrequenz_Min:  null,
      Generatorfrequenz_Max:  null,

      // Betriebsarten – welche sind möglich?
      Betriebsarten: {
        handbetrieb:       { aktiv: false },
        testbetrieb:       { aktiv: false },
        automatikbetrieb:  { aktiv: false },
        lastprobebetrieb:  { aktiv: false },
      },

      // Elektronikgeräte
      Elektronikgeraete: {
        uebestromrelais:    { aktiv: false },  // Überstromrelais
        kurzschlussrelais:  { aktiv: false },  // Kurzschlussrelais
        synchronisiergeraet:{ aktiv: false }, // Synchronisiergerät
        _eigen:             [],               // Benutzerdefinierte Prüfpunkte
      },

      // Generator-Prüfung
      Generator: {
        drehfeld:              { aktiv: false },  // Drehfeldprüfung
        spannungsregler:       { aktiv: false },  // Spannungsregler
        leistungsfaktorregler: { aktiv: false },  // Leistungsfaktorregler
        anschluesse:           { aktiv: false },  // Anschlüsse
        _eigen:                [],               // Benutzerdefinierte Prüfpunkte
      },

      // Motor-Ausstattung
      Motor_Ausstattung: {
        lima:        { aktiv: false },  // Lichtmaschine
		anlass:      { aktiv: false },  // Anlasser
        abgas:       { aktiv: false },  // Abgasanlage
        luftfilter:  { aktiv: false },  // Luftfilter
        oelbad:      { aktiv: false },  // Ölbadluftfilter
        abstell:     { aktiv: false },  // Abstell- / Freigabemagnet
		vorglueh:    { aktiv: false },  // Vorglühanlage
        kuehler:     { aktiv: false },  // Kühler
        luefter:     { aktiv: false },  // Lüfter
        keilriemen:  { aktiv: false },  // Keilriemen
        schlaeuche:  { aktiv: false },  // Kühlerschläuche
        lager:		       { aktiv: false },	// Motor- und Generatorlager
        befestigung:       { aktiv: false },  // Befestigungen prüfen
        kraftstoffleitungen:{ aktiv: false },  // Kraftstoffleitungen / -schläuche
        _eigen:            [],               // Benutzerdefinierte Prüfpunkte
      },

      // Ausstattung – zusätzliche Prüfpunkte rund ums Aggregat
      Ausstattung: {
        haupttank:        { aktiv: false },  // (Haupt-)Tank
        tagestank:        { aktiv: false },  // Tagestank
        tankleitungen:    { aktiv: false },  // Tankleitungen
        kraftstoffpumpe:  { aktiv: false },  // Kraftstoffpumpe
        sauberkeit:       { aktiv: false },  // Sauberkeit Raum/Aggregat
        _eigen:           [],               // Benutzerdefinierte Prüfpunkte
      },

      // Kühlkreise
      Kuehlkreise: {
        extern:       { aktiv: false, frostschutz: true },  // Externer Kühlkreis
        intern:       { aktiv: false, frostschutz: true },  // Interner Kühlkreis
        motorkreis:   { aktiv: false, frostschutz: true },  // Motorkühlkreis
        ladeluftkreis:{ aktiv: false, frostschutz: true },  // Ladeluftkühlkreis
      },

      // Reihenfolge der Protokoll-Rubriken (kann vom Benutzer geändert werden)
      Sektionen_Reihenfolge: [
        'Temperaturen_Heizung', 'Kuehlkreise', 'Ausstattung', 'Leckagewächter', 'Elektronikgeraete', 'Stoermeldungen',
        'Schaltanlage', 'Messinstrumente', 'Betriebsarten',
        'Generator', 'Motor_Ausstattung',
      ],

      // Eigene Rubriken (vollständig frei konfigurierbar)
      // Jede Rubrik: { id, titel, elemente: [{ id, typ, label, einheit? }] }
      // typ: 'checkbox' | 'messung' | 'text'
      Eigene_Sektionen: [],

      // Batterien (ob vorhanden)
      Hat_Starterbatterien: false,
      Hat_Steuerbatterien:  false,
    },
  };
}

// ── Eindeutige ID erzeugen ─────────────────────────────────────
export function erzeugId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
