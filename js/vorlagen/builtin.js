// Mitgelieferte Vorlagen. Werden beim ersten Start in die Datenbank übernommen
// und sind dann wie eigene Vorlagen bearbeit- und löschbar.
// Die IDs der NEA-Vorlage entsprechen den Schlüsseln des alten Datenformats,
// damit die Migration Werte 1:1 übernehmen kann.

const p = (id, label, extra = {}) => ({ id, label, aktiv: true, bewertung: true, messungen: [], ...extra });
const aus = (id, label, extra = {}) => p(id, label, { aktiv: false, ...extra });
const mess = (id, label, einheit) => ({ id, label, einheit });
const nurMessung = (id, label, einheit, extra = {}) =>
  p(id, label, { bewertung: false, messungen: [mess('wert', '', einheit)], ...extra });
const ueber = (id, label) => ({ id, art: 'ueberschrift', label });
const feld = (id, label, typ = 'text', extra = {}) => ({ id, label, typ, aktiv: true, ...extra });
const zahl = (id, label, einheit = '', extra = {}) => feld(id, label, 'zahl', { einheit, ...extra });

const checkliste = (id, titel, elemente, extra = {}) => ({ id, typ: 'checkliste', titel, aktiv: true, elemente, ...extra });

// ── Netzersatzanlage ─────────────────────────────────────────

// Nur Stammdaten (Gruppe „intern“) – erscheinen nicht im Bericht
export const BETRIEBSSTOFFE = () => [
  zahl('Menge_Motoroel', 'Motoröl – Menge', 'l'),
  feld('Typ_Motoroel', 'Motoröl – Sorte'),
  zahl('Menge_Kuehlmittel_intern', 'Kühlmittel intern – Menge', 'l'),
  feld('Typ_Kuehlmittel_intern', 'Kühlmittel intern – Sorte'),
  zahl('Menge_Kuehlmittel_extern', 'Kühlmittel extern – Menge', 'l'),
  feld('Typ_Kuehlmittel_extern', 'Kühlmittel extern – Sorte'),
];

const STOERMELDUNGEN = [
  'Öldruckmangel', 'Motor-Übertemperatur', 'Kühlwassermangel', 'Fehlstart', 'Batterieunterspannung',
  'Überlast', 'Kurzschluss', 'Leckage', 'Not-Aus betätigt', 'Störung Motorregler', 'Sicherungsfall', 'Kraftstoffmangel',
];

const NEA = {
  id: 'nea',
  herkunft: 'mitgeliefert',
  name: 'Netzersatzanlage (NEA)',
  kategorie: 'Stromerzeugung',
  beschreibung: 'Stationäre oder mobile Stromerzeugungsaggregate mit Notstromautomatik – Probelauf, Batterien, Störmeldungen, Schaltanlage.',
  stammdaten: [
    { id: 'aggregat', titel: 'Aggregat', felder: [
      zahl('Leistung_kVA', 'Leistung', 'kVA'),
      feld('Aufstellung', 'Aufstellung', 'auswahl', { optionen: ['Stationär', 'Mobil'] }),
      feld('Motor_Typ', 'Motor-Typ'),
      feld('Motor_NR', 'Motor-Nummer'),
      feld('Lastbetrieb', 'Lastbetrieb', 'auswahl', { optionen: ['Übergabe mit Synchronisierung', 'Übergabe ohne Synchronisierung', 'Inselbetrieb', 'Parallelbetrieb'] }),
      feld('Kunden_Bestellnr', 'Kunden-Bestellnummer'),
    ] },
    { id: 'generator', titel: 'Generator & Regler', felder: [
      feld('Generator_Hersteller', 'Generator – Hersteller'),
      feld('Generator_Typ', 'Generator – Typ'),
      feld('Generator_Serien_NR', 'Generator – Seriennummer'),
      feld('Generator_Regler_Typ', 'Spannungsregler – Typ'),
      feld('Motorregler_Hersteller', 'Drehzahlregler – Hersteller'),
      feld('Motorregler_Typ', 'Drehzahlregler – Typ'),
    ] },
    { id: 'nsa', titel: 'Notstromautomatik', felder: [
      feld('NSA_Hersteller', 'Hersteller'),
      feld('NSA_Typ', 'Typ'),
      feld('NSA_Serien_NR', 'Seriennummer'),
    ] },
    { id: 'kuehlung', titel: 'Betriebsstoffe', intern: true, felder: BETRIEBSSTOFFE() },
    { id: 'intervalle', titel: 'Wartungsintervalle', intern: true, felder: [
      zahl('Oelwechsel_Intervall', 'Ölwechsel', 'Monate'),
      zahl('DGUV_Intervall', 'DGUV V3', 'Monate'),
      zahl('Motorwartung_Intervall', 'Motorwartung', 'Monate'),
      zahl('Elektr_Wartung_Intervall', 'Elektrische Wartung', 'Monate'),
      zahl('Luftfilter_Intervall', 'Luftfilter', 'Monate'),
      zahl('Kuehlmittel_Intervall_intern', 'Kühlmittel intern', 'Monate'),
      zahl('Kuehlmittel_Intervall_extern', 'Kühlmittel extern', 'Monate'),
    ] },
    { id: 'intern', titel: 'Intern', intern: true, felder: [
      zahl('Wartungspauschale', 'Wartungspauschale', '€/Jahr'),
      feld('Server_Link', 'Server-Link / Netzwerkpfad'),
    ] },
  ],
  sektionen: [
    { id: 'Betriebsdaten', typ: 'tabelle', titel: 'Betriebsdaten', aktiv: true,
      spalten: [{ id: 'vor', label: 'Vor Wartung' }, { id: 'nach', label: 'Nach Wartung' }],
      zeilen: [
        { id: 'betriebsstunden', label: 'Betriebsstunden', einheit: 'h', aktiv: true },
        { id: 'startzaehler', label: 'Startzähler', einheit: '×', aktiv: false },
      ] },
    { id: 'Spannung_Frequenz', typ: 'felder', titel: 'Spannungs- und Frequenzverstellung', aktiv: true,
      hinweis: 'Erreichbare Min-/Max-Werte bei variabler Spannung bzw. Frequenz.',
      elemente: [
        zahl('spannung_min', 'Spannung min', 'V', { aktiv: false }),
        zahl('spannung_max', 'Spannung max', 'V', { aktiv: false }),
        zahl('frequenz_min', 'Frequenz min', 'Hz', { aktiv: false }),
        zahl('frequenz_max', 'Frequenz max', 'Hz', { aktiv: false }),
      ] },
    { id: 'Probelauf', typ: 'messreihe', titel: 'Probelauf', aktiv: true, eintragLabel: 'Lauf', vorgabeAnzahl: 1,
      felder: [
        feld('beschreibung', 'Beschreibung'),
        zahl('last_kw', 'Belastung', 'kW'),
        zahl('laufzeit_min', 'Laufzeit', 'min'),
        zahl('spannung_l1', 'Spannung L1', 'V'),
        zahl('spannung_l2', 'Spannung L2', 'V'),
        zahl('spannung_l3', 'Spannung L3', 'V'),
        zahl('frequenz', 'Frequenz', 'Hz'),
        zahl('strom_l1', 'Strom L1', 'A'),
        zahl('strom_l2', 'Strom L2', 'A'),
        zahl('strom_l3', 'Strom L3', 'A'),
        zahl('leistung_kw', 'Wirkleistung', 'kW'),
        zahl('cos_phi', 'cos φ'),
        zahl('oeldruck_bar', 'Öldruck', 'bar'),
        zahl('motortemperatur', 'Motortemperatur', '°C'),
      ] },
    { id: 'Arbeiten', typ: 'aufgaben', titel: 'Arbeiten', aktiv: true, elemente: [
      { id: 'elektr_wartung', label: 'Elektrische Wartung', aktiv: true },
      { id: 'motor_wartung', label: 'Motorwartung mit Wechsel der Kraftstofffilter', aktiv: true },
      { id: 'oelwechsel', label: 'Ölwechsel', aktiv: true },
      { id: 'dguv', label: 'DGUV-V3-Prüfung', aktiv: true },
      { id: 'luftfilter', label: 'Luftfilterwechsel', aktiv: true },
      { id: 'kuehlmittel_intern', label: 'Kühlmittel intern erneuert', aktiv: true },
      { id: 'kuehlmittel_extern', label: 'Kühlmittel extern erneuert', aktiv: true },
      { id: 'zahnriemenwechsel', label: 'Zahnriemenwechsel', aktiv: true },
    ] },
    { id: 'Batterien', typ: 'batterien', titel: 'Batterieprüfung', aktiv: true,
      gruppen: [
        { id: 'starterbatterie', name: 'Starterbatterien', anzahl: 2, spannung: 12, kapazitaet: null, typ: '', hersteller: '', wartungsfrei: false },
        { id: 'steuerbatterie', name: 'Steuerbatterien', anzahl: 0, spannung: 12, kapazitaet: null, typ: '', hersteller: '', wartungsfrei: false },
      ],
      lader: [
        { id: 'lader1', name: 'Ladegerät 1', aktiv: true },
        { id: 'lader2', name: 'Ladegerät 2', aktiv: false },
      ] },
    checkliste('Temperaturen_Heizung', 'Temperaturen / Heizung', [
      nurMessung('aussentemperatur', 'Außentemperatur', '°C'),
      aus('motorvorwaermung', 'Motorvorwärmung', { messungen: [mess('temp', 'Temperatur', '°C')] }),
      aus('kraftstoffvorwaerm', 'Kraftstoffvorwärmung'),
      aus('raumheizung', 'Raumheizung'),
      nurMessung('raumtemperatur', 'Raumtemperatur', '°C', { aktiv: false }),
    ]),
    checkliste('Kuehlkreise', 'Kühlkreise', [
      p('motorkreis', 'Motorkühlkreis', { messungen: [mess('frostschutz', 'Frostschutz bis', '°C')] }),
      aus('intern', 'Interner Kühlkreis', { messungen: [mess('frostschutz', 'Frostschutz bis', '°C')] }),
      aus('extern', 'Externer Kühlkreis', { messungen: [mess('frostschutz', 'Frostschutz bis', '°C')] }),
      aus('ladeluftkreis', 'Ladeluftkühlkreis', { messungen: [mess('frostschutz', 'Frostschutz bis', '°C')] }),
    ]),
    checkliste('Ausstattung', 'Ausstattung', [
      p('haupttank', '(Haupt-)Tank'),
      aus('tagestank', 'Tagestank'),
      p('tankleitungen', 'Tankleitungen'),
      aus('kraftstoffpumpe', 'Kraftstoffpumpe'),
      p('sauberkeit', 'Sauberkeit Raum / Aggregat'),
    ]),
    checkliste('Leckagewächter', 'Leckageüberwachung', [
      aus('leck_aggregat', 'Aggregat'),
      aus('leck_haupttank', 'Haupttank'),
      aus('leck_tagestank', 'Tagestank'),
    ], { hinweis: 'Für Unterdruckleckagewächter die Messwerte „Pumpe ein [mbar]; Alarm ein [mbar]; Alarm aus [mbar]; Pumpe aus [mbar]“ eintragen.' }),
    checkliste('Elektronikgeraete', 'Elektronikgeräte', [
      aus('ueberstromrelais', 'Überstromrelais'),
      aus('kurzschlussrelais', 'Kurzschlussrelais'),
      aus('synchronisiergeraet', 'Synchronisiergerät'),
    ]),
    checkliste('Stoermeldungen', 'Störmeldungen', STOERMELDUNGEN.map((n, i) => aus(`stoer_${i + 1}`, n, { tag: 'A' })),
      { hinweis: 'Kennzeichnung: A = abstellend, AV = abstellend mit Verzögerung, W = warnend.' }),
    checkliste('Schaltanlage', 'Schaltanlage', [
      aus('hupe', 'Signalhorn (Hupe)'),
      p('notaus', 'NOT-AUS-Schalter'),
      aus('potfrei', 'Potentialfreie Meldungen'),
      aus('lastprobe', 'Lastprobeschalter'),
      p('stoerungen', 'Anzeige für Störmeldungen'),
      p('beleuchtng', 'Beleuchtung Schaltanlage'),
      aus('beleuchtngagg', 'Beleuchtung Aggregat'),
      p('genschalter', 'Generatorschalter'),
      p('netzschalter', 'Netzschalter'),
      aus('ueberwachung', 'Überwachungseinrichtung'),
    ]),
    checkliste('Messinstrumente', 'Messinstrumente', [
      aus('pf', 'Leistungsfaktor (cos φ)'),
      p('sp', 'Spannung'),
      aus('nullsp', 'Nullspannung'),
      p('str', 'Strom'),
      aus('umsch', 'Messstellenumschalter Netz/Gen'),
      aus('umschL123', 'Umschalter L1/L2/L3'),
      p('freq', 'Frequenz'),
      aus('leist', 'Leistung (kW)'),
      p('batlad', 'Batterieladestrom'),
      aus('batsp', 'Batterieladespannung'),
      aus('kwtemp', 'Kühlwassertemperatur'),
      aus('kraftst', 'Kraftstoffvorrat'),
      aus('oeldruck', 'Öldruck'),
      aus('drehz', 'Drehzahl'),
    ]),
    checkliste('Betriebsarten', 'Betriebsarten', [
      p('handbetrieb', 'Handbetrieb'),
      p('testbetrieb', 'Testbetrieb'),
      p('automatikbetrieb', 'Automatikbetrieb'),
      aus('lastprobebetrieb', 'Lastprobebetrieb'),
    ]),
    checkliste('Generator', 'Generator', [
      p('drehfeld', 'Drehfeld'),
      p('spannungsregler', 'Spannungsregler'),
      aus('leistungsfaktorregler', 'Leistungsfaktorregler'),
      p('anschluesse', 'Anschlüsse'),
    ]),
    checkliste('Motor_Ausstattung', 'Motor', [
      p('lima', 'Lichtmaschine'),
      p('anlass', 'Anlasser'),
      p('abgas', 'Abgasanlage'),
      p('luftfilter', 'Luftfilter'),
      aus('oelbad', 'Ölbadluftfilter'),
      aus('abstell', 'Abstell- / Freigabemagnet'),
      aus('vorglueh', 'Vorglühanlage'),
      p('kuehler', 'Kühler'),
      p('luefter', 'Lüfter'),
      p('keilriemen', 'Keilriemen'),
      p('schlaeuche', 'Kühlerschläuche'),
      aus('lager', 'Motor- und Generatorlager'),
      p('befestigung', 'Befestigungen'),
      p('kraftstoffleitungen', 'Kraftstoffleitungen / -schläuche'),
    ]),
    { id: 'Abschluss', typ: 'felder', titel: 'Übergabe', aktiv: true, elemente: [
      feld('verlassen_in_betriebsart', 'Anlage verlassen in Betriebsart', 'auswahl', { optionen: ['Automatik', 'Manuell', 'Aus'] }),
    ] },
  ],
};

// ── Aggregat & Aggregateraum nach DIN 6280-13 ────────────────

const KH = 'Krankenhaus';
const VS = 'Versammlungsstätte';

const DIN6280 = {
  id: 'din6280',
  herkunft: 'mitgeliefert',
  name: 'Aggregat & Aggregateraum (DIN 6280-13)',
  kategorie: 'Stromerzeugung',
  beschreibung: 'Praxisorientierte Prüfliste für Aggregat und Aufstellraum, ohne DGUV V3 und Umschalteinrichtung. Vor Einsatz gegen Norm und Herstellerhandbuch abgleichen.',
  stammdaten: [
    { id: 'aggregat', titel: 'Aggregat', felder: [
      zahl('Leistung_kVA', 'Leistung', 'kVA'),
      feld('Motor_Typ', 'Motor-Typ'),
      feld('Einsatzbereich', 'Einsatzbereich', 'auswahl', { optionen: ['Allgemein', KH, VS] }),
    ] },
  ],
  sektionen: [
    { id: 'betriebsdaten', typ: 'tabelle', titel: 'Betriebsdaten', aktiv: true,
      spalten: [{ id: 'vor', label: 'Vor Wartung' }, { id: 'nach', label: 'Nach Wartung' }],
      zeilen: [{ id: 'betriebsstunden', label: 'Betriebsstunden', einheit: 'h', aktiv: true }] },
    checkliste('doku', 'Dokumentation & Voraussichtung', [
      p('bstd', 'Betriebsstundenzähler ablesen und eintragen'),
      p('buch', 'Eintrag im Betriebs-/Wartungsbuch der Anlage'),
      p('vormaengel', 'Abgleich mit Mängeln aus vorherigem Protokoll', { hinweis: 'offene Punkte übernehmen oder abhaken' }),
      p('sicht', 'Allgemeine Sichtprüfung auf äußere Schäden, Verschmutzung, Fremdkörper'),
    ]),
    checkliste('motor', 'Motor', [
      p('oelstand', 'Motorölstand prüfen'),
      p('oelwechsel', 'Motorölwechsel', { hinweis: 'Herstellerintervall / Betriebsstunden' }),
      p('oelfilter', 'Ölfilter wechseln', { hinweis: 'i. d. R. mit Ölwechsel' }),
      p('kuehlmittel', 'Kühlmittelstand prüfen'),
      p('frostschutz', 'Frostschutz-/Kühlmittelkonzentration messen', { messungen: [mess('frost', 'Frostschutz bis', '°C')] }),
      p('riemen', 'Keilriemen/Zahnriemen auf Zustand, Spannung, Rissbildung prüfen'),
      p('schlaeuche', 'Schläuche, Schellen und Verbindungen auf Dichtheit prüfen'),
      p('luftfilter', 'Luftfilter prüfen, ggf. wechseln'),
      p('ventilspiel', 'Ventilspiel prüfen/einstellen', { hinweis: 'großes Serviceintervall' }),
    ]),
    checkliste('kraftstoff', 'Kraftstoffanlage', [
      p('filter', 'Kraftstoff-Vorfilter/Feinfilter prüfen, ggf. wechseln'),
      p('fuellstand', 'Tankfüllstand prüfen und dokumentieren', { messungen: [mess('stand', 'Füllstand', '%')] }),
      p('wasser', 'Tankboden auf Wasser-/Kondensatansammlung prüfen, ggf. entwässern'),
      p('qualitaet', 'Kraftstoffqualität/-alterung prüfen', { hinweis: 'mikrobieller Befall, „Dieselpest“' }),
      p('leckage', 'Tank und Leitungen auf Leckagen prüfen'),
      p('leckwarn', 'Bei doppelwandigem Tank: Leckwarnsystem/Sensor auf Funktion prüfen'),
      aus('autonomie', 'Bevorratungsmenge gegen geforderte Autonomiezeit abgleichen', { tag: VS }),
    ]),
    checkliste('kuehlung', 'Kühlung & Lüftung des Aggregats', [
      p('kuehler', 'Kühler/Wärmetauscher auf Verschmutzung und Beschädigung prüfen'),
      p('luefter', 'Lüfter und Lüfterantrieb auf Funktion und Zustand prüfen'),
    ]),
    checkliste('abgas', 'Abgasanlage', [
      p('dicht', 'Abgasleitung und Schalldämpfer auf Dichtheit und Korrosion prüfen'),
      p('kompensator', 'Kompensatoren/flexible Verbindungen auf Risse prüfen'),
      p('befestigung', 'Befestigung und Aufhängung der Abgasanlage prüfen'),
    ]),
    checkliste('elektrik', 'Elektrik & Steuerung des Aggregats', [
      p('generator', 'Generator: Sichtprüfung, Anschlüsse auf festen Sitz prüfen'),
      aus('isolation', 'Isolationswiderstand des Generators messen', { hinweis: 'größeres Intervall', messungen: [mess('riso', 'R iso', 'MΩ')] }),
      p('batterie', 'Starterbatterien: Spannung und Ladezustand prüfen', { messungen: [mess('u', 'Spannung', 'V')] }),
      aus('saeure', 'Säurestand der Starterbatterien prüfen', { hinweis: 'bei Blei-Säure-Batterien' }),
      p('lader', 'Batterieladegerät/Erhaltungsladung auf Funktion prüfen'),
      p('anlasser', 'Anlasser auf Funktion prüfen'),
      p('fehlerspeicher', 'Motorsteuergerät/Genset-Controller: Fehlerspeicher auslesen'),
      p('meldungen', 'Warn- und Alarmmeldungen am Bedienfeld prüfen'),
      p('notaus', 'Not-Aus-Funktion des Aggregats prüfen'),
    ]),
    checkliste('probelauf', 'Probelauf', [
      p('durchfuehren', 'Probelauf durchführen', { hinweis: 'Leerlauf oder Last je nach Vorgabe', messungen: [mess('dauer', 'Dauer', 'min')] }),
      p('nennwerte', 'Erreichte Nennspannung und -frequenz prüfen', { messungen: [mess('u', 'Spannung', 'V'), mess('f', 'Frequenz', 'Hz')] }),
      aus('anlaufzeit', 'Anlaufzeit bis Erreichen der Nennspannung messen', { hinweis: 'Grenzwert ≤ 15 s', tag: `${KH} / ${VS}`, messungen: [mess('t', 'Anlaufzeit', 's')] }),
      aus('lastprobe', 'Lastprobelauf mit dokumentierter Mindestlast und -dauer', { tag: KH, messungen: [mess('last', 'Last', 'kW'), mess('dauer', 'Dauer', 'min')] }),
      p('geraeusch', 'Geräusch- und Vibrationsauffälligkeiten während des Probelaufs protokollieren'),
    ]),
    checkliste('raum', 'Aggregateraum', [
      p('luft', 'Zu- und Abluftöffnungen frei von Verstellung und Verschmutzung'),
      p('temperatur', 'Raumtemperatur im zulässigen Bereich', { messungen: [mess('t', 'Raumtemperatur', '°C')] }),
      p('brandschutz', 'Brandschutzklappen/-abschottungen sichtprüfen'),
      p('loescher', 'Feuerlöscher im Raum vorhanden, Prüfdatum gültig'),
      p('wanne', 'Auffangwanne/Leckageschutz für Kraftstoff auf Dichtheit prüfen'),
      p('wanne_leer', 'Auffangwanne auf Fremdflüssigkeit (Regenwasser, Kondensat) prüfen, leeren'),
      p('beleuchtung', 'Raumbeleuchtung inkl. Ersatzbeleuchtung auf Funktion prüfen'),
      p('tuer', 'Zugangstür: Selbstschließer und Verriegelung auf Funktion prüfen'),
      p('kennzeichnung', 'Kennzeichnung und Betriebsanweisung vorhanden und lesbar'),
      p('bindemittel', 'Ölbindemittel und Sicherheitsausrüstung im Raum vorhanden'),
    ]),
    checkliste('abschlusspunkte', 'Abschluss der Wartung', [
      p('maengelliste', 'Mängelliste erstellen, Fristen für Nachbesserung festlegen'),
      p('freigabe', 'Freigabevermerk: Anlage betriebsbereit'),
    ]),
  ],
};

// ── USV-Anlage ───────────────────────────────────────────────

const USV = {
  id: 'usv',
  herkunft: 'mitgeliefert',
  name: 'USV-Anlage',
  kategorie: 'Stromversorgung',
  beschreibung: 'Unterbrechungsfreie Stromversorgung: Sichtprüfung, Messwerte, Batterieanlage, Funktionstest.',
  stammdaten: [
    { id: 'usv', titel: 'USV', felder: [
      zahl('Leistung_kVA', 'Leistung', 'kVA'),
      feld('Topologie', 'Topologie', 'auswahl', { optionen: ['Online (VFI)', 'Line-Interactive (VI)', 'Offline (VFD)'] }),
      zahl('Autonomiezeit_Soll', 'Autonomiezeit (Soll)', 'min'),
      feld('Firmware', 'Firmware-Stand'),
    ] },
  ],
  sektionen: [
    checkliste('sicht', 'Sichtprüfung', [
      p('umgebung', 'Aufstellraum: Temperatur, Sauberkeit, Belüftung', { messungen: [mess('t', 'Raumtemperatur', '°C')] }),
      p('anzeige', 'Display / Statusanzeigen'),
      p('alarmspeicher', 'Alarm- und Ereignisspeicher ausgelesen'),
      p('luefter', 'Lüfter auf Funktion und Verschmutzung'),
      p('anschluesse', 'Leistungsanschlüsse auf festen Sitz / Verfärbung'),
      p('kondensatoren', 'Kondensatoren auf Aufblähung / Leckage'),
    ]),
    { id: 'messwerte', typ: 'tabelle', titel: 'Messwerte', aktiv: true,
      spalten: [{ id: 'l1', label: 'L1' }, { id: 'l2', label: 'L2' }, { id: 'l3', label: 'L3' }],
      zeilen: [
        { id: 'u_ein', label: 'Eingangsspannung', einheit: 'V', aktiv: true },
        { id: 'u_aus', label: 'Ausgangsspannung', einheit: 'V', aktiv: true },
        { id: 'i_aus', label: 'Ausgangsstrom', einheit: 'A', aktiv: true },
        { id: 'last', label: 'Auslastung', einheit: '%', aktiv: true },
      ] },
    { id: 'batterien', typ: 'batterien', titel: 'Batterieanlage', aktiv: true,
      gruppen: [{ id: 'strang1', name: 'Strang 1', anzahl: 0, spannung: 12, kapazitaet: null, typ: '', hersteller: '', wartungsfrei: true }],
      lader: [] },
    checkliste('funktion', 'Funktionstest', [
      p('bypass', 'Umschaltung auf Bypass und zurück'),
      p('batteriebetrieb', 'Batteriebetrieb (Netzausfall simuliert)', { messungen: [mess('dauer', 'Überbrückte Zeit', 'min')] }),
      p('fernmeldung', 'Fernmeldungen / Kommunikationsschnittstelle'),
      aus('epo', 'Not-Aus (EPO)'),
    ]),
    { id: 'arbeiten', typ: 'aufgaben', titel: 'Arbeiten', aktiv: true, elemente: [
      { id: 'reinigung', label: 'Reinigung', aktiv: true },
      { id: 'luefter', label: 'Lüftertausch', aktiv: true },
      { id: 'batterietausch', label: 'Batterietausch', aktiv: true },
      { id: 'kondensatoren', label: 'Kondensatortausch', aktiv: true },
      { id: 'firmware', label: 'Firmware-Update', aktiv: true },
    ] },
  ],
};

const LEER = {
  id: 'leer',
  herkunft: 'mitgeliefert',
  name: 'Leere Vorlage',
  kategorie: 'Allgemein',
  beschreibung: 'Ohne Prüfpunkte – der Prüfplan wird komplett selbst aufgebaut.',
  stammdaten: [],
  sektionen: [],
};

export const BUILTIN_VORLAGEN = [NEA, DIN6280, USV, LEER];
