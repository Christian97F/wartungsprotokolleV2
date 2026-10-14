#!/usr/bin/env python3
"""Einmalige Übernahme einer Sicherung der Wartungs-App in die Excel-Arbeitsmappe „Wartungsdaten.xlsx“.

Erzeugt je Zielblatt eine Tab-getrennte Textdatei nach „PWA_Importformat.md“ (Stand 14.10.2026),
die im Editor kopiert und in Excel unter die jeweilige Tabelle eingefügt wird.

Aufruf (benötigt: pip install openpyxl):
    python backup_zu_excel.py Wartung_Backup_2026-10-14.json --excel Wartungsdaten.xlsx

Vorher wird der Aufbau der Mappe geprüft (Tabellen, Spaltennamen, lückenlose Eingabeblöcke). Passt er nicht,
bricht das Programm ohne Ausgabe ab und schreibt einen Bericht nach „Strukturpruefung.txt“.
Danach wird abgeglichen: Termine, Mitarbeiter und Technische Daten, die es schon gibt, werden nicht erneut
ausgegeben; die Kunden-Nr neuer Aggregate stammt aus dem Blatt „Kunden“.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

MAX_ZELLE = 32_767
GEKUERZT = ' … (gekürzt, siehe Protokoll)'

LEISTUNGEN = ['elektr_wartung', 'motor_wartung', 'oelwechsel', 'dguv',
              'kuehlmittel_intern', 'kuehlmittel_extern', 'luftfilter', 'zahnriemenwechsel']
INTERVALLE = ['Elektr_Wartung_Intervall', 'Motorwartung_Intervall', 'Oelwechsel_Intervall', 'DGUV_Intervall',
              'Kuehlmittel_Intervall_intern', 'Kuehlmittel_Intervall_extern', 'Luftfilter_Intervall']


# ── Feldformate (Abschnitt 2 und 3) ─────────────────────────

def text(wert) -> str:
    if wert is None:
        return ''
    t = str(wert).replace('\r\n', ' / ').replace('\n', ' / ').replace('\r', ' / ').replace('\t', ' ').strip()
    # Excel würde sonst eine Formel daraus machen
    return "'" + t if t[:1] in ('=', '+', '-', '@') else t


def zahl(wert) -> float | None:
    if wert is None or wert == '':
        return None
    if isinstance(wert, (int, float)):
        return float(wert)
    try:
        return float(str(wert).strip().replace('.', '').replace(',', '.')
                     if ',' in str(wert) else str(wert).strip())
    except ValueError:
        return None


def ganzzahl(wert) -> str:
    z = zahl(wert)
    return '' if z is None else str(round(z))


def dezimal(wert) -> str:
    z = zahl(wert)
    if z is None:
        return ''
    return (str(int(z)) if z.is_integer() else repr(z)).replace('.', ',')


def geld(wert) -> str:
    z = zahl(wert)
    return '' if z is None else f'{z:.2f}'.replace('.', ',')


def datum(iso) -> str:
    if not iso:
        return ''
    return datetime.strptime(str(iso)[:10], '%Y-%m-%d').strftime('%d.%m.%Y')


def ja_nein(wert) -> str:
    return '' if wert is None else ('Ja' if wert else 'Nein')


def x(wert) -> str:
    return 'x' if wert else ''


def ref(anzeige: str, schluessel: str, leer: str) -> str:
    anzeige = text(anzeige).replace('[', '(').replace(']', ')') or leer
    return f'{anzeige} [{schluessel}]'


def ref_aggregat(bezeichnung, kommission) -> str:
    return ref(bezeichnung, kommission, '(ohne Bezeichnung)')


def ref_kunde(name, nr) -> str:
    return ref(name, nr, '(ohne Namen)')


def schluessel_aus_ref(wert) -> str:
    """Text zwischen dem letzten „[“ und dem abschließenden „]“ (wie die Excel-Formel)."""
    t = str(wert or '').strip()
    if t.endswith(']') and '[' in t:
        return t[t.rindex('[') + 1:-1].strip()
    return t


def server_link(pfad) -> str:
    """Format G:/Überordner\\Unterordner\\Ziel – nach dem Laufwerk ein „/“, danach nur „\\“."""
    t = str(pfad or '').strip().strip('"')
    m = re.match(r'^([A-Za-z]):[\\/]*(.*)$', t)
    if not m:
        return t
    rest = m.group(2).replace('/', '\\')
    return f'{m.group(1).upper()}:/{rest}'


# ── Daten aus der Sicherung ─────────────────────────────────

@dataclass
class Bericht:
    hinweise: list[str] = field(default_factory=list)

    def __call__(self, meldung: str):
        self.hinweise.append(meldung)


def lade_sicherung(pfad: Path) -> dict:
    daten = json.loads(pfad.read_text(encoding='utf-8-sig'))
    if daten.get('format') != 'wartungsprotokolle':
        sys.exit(f'„{pfad.name}“ ist keine Sicherung der Wartungs-App (Komplettsicherung aus „Daten“ verwenden).')
    return daten


def sektionen(plan, typ):
    return [s for s in plan or [] if s.get('typ') == typ]


def zaehlerstand(p, zeile_id):
    for sek in sektionen(p.get('plan'), 'tabelle'):
        werte = (p.get('werte') or {}).get(sek['id'], {}).get(zeile_id)
        if not werte:
            continue
        for spalte in ('nach', 'vor'):
            if zahl(werte.get(spalte)) is not None:
                return werte[spalte]
        for spalte in reversed(sek.get('spalten', [])):
            if zahl(werte.get(spalte['id'])) is not None:
                return werte[spalte['id']]
    return None


def arbeiten(p):
    erledigt, geplant = set(), False
    for sek in sektionen(p.get('plan'), 'aufgaben'):
        for el_id, w in (p.get('werte') or {}).get(sek['id'], {}).items():
            if w and w.get('erledigt'):
                erledigt.add(el_id)
            geplant |= bool(w and w.get('geplant'))
    return erledigt, geplant


def maengel(p) -> list[str]:
    liste = []
    werte = p.get('werte') or {}
    for sek in p.get('plan') or []:
        w = werte.get(sek['id']) or {}
        if sek.get('typ') == 'checkliste':
            for el in sek.get('elemente', []):
                v = w.get(el.get('id')) or {}
                if el.get('art') == 'ueberschrift' or v.get('s') != 'mangel':
                    continue
                eintrag = f"{sek.get('titel', '')}: {el.get('label', '')}"
                if (v.get('notiz') or '').strip():
                    eintrag += f" – {v['notiz'].strip()}"
                liste.append(eintrag + (' (behoben)' if v.get('behoben') else ''))
        elif sek.get('typ') == 'batterien':
            for g in sek.get('gruppen', []):
                for i, b in enumerate((w.get('gruppen') or {}).get(g['id'], []), 1):
                    if b.get('klemmen') == 'mangel':
                        liste.append(f"{sek.get('titel', '')}: {g.get('name', '')} {i} Anschlussklemmen"
                                     + (' (behoben)' if b.get('behoben') else ''))
    for m in p.get('maengel') or []:
        if (m.get('text') or '').strip():
            liste.append(m['text'].strip() + (' (behoben)' if m.get('behoben') else ''))
    return liste


def bemerkung(liste: list[str], allgemein) -> str:
    teile = []
    if liste:
        teile.append('Mängel: ' + ' / '.join(f'{i}) {text(m)}' for i, m in enumerate(liste, 1)))
    if text(allgemein):
        teile.append(text(allgemein))
    t = ' | '.join(teile)
    return t if len(t) <= MAX_ZELLE else t[:MAX_ZELLE - len(GEKUERZT)] + GEKUERZT


def techniker(name) -> list[str]:
    namen = [n.strip() for n in re.split(r'\s*(?:,|;|/|&|\bund\b)\s*', str(name or '')) if n.strip()]
    if len(namen) > 3:
        namen = namen[:2] + [', '.join(namen[2:])]
    return (namen + ['', '', ''])[:3]


# ── Bestehende Excel-Mappe (optional) ───────────────────────

@dataclass
class Bestand:
    aggregate: set[str] = field(default_factory=set)
    technik: set[str] = field(default_factory=set)
    kunden: dict[str, str] = field(default_factory=dict)   # Name (klein) → Kunden-Nr
    mitarbeiter: set[str] = field(default_factory=set)
    termine: set[tuple[str, str]] = field(default_factory=set)  # (TT.MM.JJJJ, Kommission)


# Eingabeblöcke laut PWA_Importformat.md, Abschnitt 6 (Reihenfolge = Feldreihenfolge der Importdateien)
EINGABEBLOECKE = {
    'tblTermine': ('Termine', [
        'Datum', 'Aggregat', 'Projekt-Nr', 'Status', 'Techniker 1', 'Techniker 2', 'Techniker 3',
        'Elektr. Wartung', 'Motorwartung', 'Ölwechsel', 'DGUV', 'Kühlmittel intern', 'Kühlmittel extern',
        'Luftfilter', 'Zahnriemen', 'Offene Arbeiten', 'Betriebsstunden', 'Startzahl', 'Bemerkung']),
    'tblAggregate': ('Aggregate', [
        'Kommission', 'Bezeichnung', 'Kunde', 'Standort', 'Straße', 'PLZ', 'Ort', 'Hersteller', 'Typ', 'Serien-Nr',
        'Leistung (kVA)', 'Motortyp', 'Motor-Nr', 'Kühlmittel intern Menge', 'Kühlmittel intern Sorte',
        'Kühlmittel extern Menge', 'Kühlmittel extern Sorte', 'Intervall Elektr. Wartung (Monate)',
        'Intervall Motorwartung (Monate)', 'Intervall Ölwechsel (Monate)', 'Intervall DGUV (Monate)',
        'Intervall Kühlmittel intern (Monate)', 'Intervall Kühlmittel extern (Monate)', 'Intervall Luftfilter (Monate)',
        'Wartungsvertrag', 'Vertrags-Nr', 'Wartungspauschale', 'Server-Link', 'Bemerkung']),
    'tblTechnik': ('Technische Daten', [
        'Aggregat', 'Generator Hersteller', 'Generator Typ', 'Generator Serien-Nr', 'Generator Regler Typ',
        'Motorregler Hersteller', 'Motorregler Typ', 'NSA Hersteller', 'NSA Typ', 'NSA Serien-Nr',
        'Ladegerät 1 Hersteller', 'Ladegerät 1 Typ', 'Ladegerät 2 Hersteller', 'Ladegerät 2 Typ',
        'Starterbatterie Hersteller', 'Starterbatterie Typ', 'Starterbatterie Anzahl', 'Starterbatterie Spannung (V)',
        'Starterbatterie Kapazität (Ah)', 'Starterbatterie wartungsfrei', 'Steuerbatterie Hersteller',
        'Steuerbatterie Typ', 'Steuerbatterie Anzahl', 'Steuerbatterie Spannung (V)', 'Steuerbatterie Kapazität (Ah)',
        'Steuerbatterie wartungsfrei']),
    'tblKunden': ('Kunden', ['Kunden-Nr', 'Name']),
    'tblMitarbeiter': ('Mitarbeiter', ['Name']),
}


def norm_kopf(t) -> str:
    return ' '.join(str(t or '').replace('\xa0', ' ').split())


def pruefe_block(tabelle: str, blatt: str, kopf: list[str], soll: list[str]) -> list[str]:
    """Fehlertexte, wenn die Eingabespalten fehlen oder nicht lückenlos in Sollreihenfolge stehen."""
    import difflib
    fehler = []
    ist = [norm_kopf(k) for k in kopf]
    fehlend = [sp for sp in soll if sp not in ist]
    if fehlend:
        def mit_vorschlag(sp):
            aehnlich = difflib.get_close_matches(sp, [k for k in ist if k not in soll], n=1, cutoff=0.6)
            return f'„{sp}“' + (f' (vorhanden ist „{aehnlich[0]}“)' if aehnlich else '')
        fehler.append(f'{len(fehlend)} von {len(soll)} Eingabespalten fehlen: ' + ', '.join(map(mit_vorschlag, fehlend)))
    doppelt = sorted({sp for sp in soll if ist.count(sp) > 1})
    for sp in doppelt:
        fehler.append(f'Spalte „{sp}“ kommt mehrfach vor')
    if fehlend or doppelt:
        return fehler
    pos = [ist.index(sp) for sp in soll]
    if pos != sorted(pos):
        reihenfolge = [ist[i] for i in sorted(pos)]
        fehler.append('Eingabespalten in falscher Reihenfolge.\n      Ist:  ' + ' | '.join(reihenfolge)
                      + '\n      Soll: ' + ' | '.join(soll))
        return fehler
    im_block = [ist[i] for i in range(pos[0], pos[-1] + 1) if ist[i] not in soll]
    if im_block:
        fehler.append('Spalten liegen innerhalb des Eingabeblocks und würden beim Einfügen überschrieben: '
                      + ', '.join(f'„{sp}“' for sp in im_block)
                      + f'.\n      Bitte in Excel (Blatt „{blatt}“) aus dem Block heraus an den Rand verschieben: '
                        'Spaltenkopf markieren, Umschalttaste halten, Spalte an den Tabellenrand ziehen.')
    return fehler


def lese_excel(pfad: Path, protokoll: Path) -> Bestand:
    try:
        from openpyxl import load_workbook
    except ImportError:
        sys.exit('Zum Lesen der Excel-Mappe wird openpyxl benötigt:  pip install openpyxl')
    if not pfad.exists():
        sys.exit(f'Excel-Mappe nicht gefunden: {pfad}')
    try:
        wb = load_workbook(pfad, data_only=True)
    except Exception as e:  # beschädigt, falsches Format, in Excel gesperrt …
        sys.exit(f'Excel-Mappe „{pfad.name}“ kann nicht gelesen werden: {e}')

    tabellen, koepfe, fundorte = {}, {}, {}
    for ws in wb.worksheets:
        for tbl in ws.tables.values():
            zeilen = list(ws[tbl.ref])
            kopf = [norm_kopf(z.value) for z in zeilen[0]]
            koepfe[tbl.displayName] = kopf
            fundorte[tbl.displayName] = f'Blatt „{ws.title}“, Bereich {tbl.ref}'
            tabellen[tbl.displayName] = [dict(zip(kopf, (z.value for z in zeile))) for zeile in zeilen[1:]]

    fehler = []
    for tabelle, (blatt, soll) in EINGABEBLOECKE.items():
        if tabelle not in koepfe:
            fehler.append(f'[{blatt}] Tabelle „{tabelle}“ nicht gefunden.')
            continue
        fehler += [f'[{blatt}] {f}' for f in pruefe_block(tabelle, blatt, koepfe[tabelle], soll)]

    diagnose = [f'Excel-Mappe: {pfad.resolve()}', '', 'Gefundene Blätter: ' + ', '.join(ws.title for ws in wb.worksheets), '']
    diagnose += ['Gefundene Tabellen und Spaltenköpfe:']
    for name, kopf in koepfe.items():
        diagnose.append(f'  {name}  ({fundorte[name]}, {len(tabellen[name])} Zeilen)')
        diagnose += [f'    {i:>2}. {k or "(leer)"}' for i, k in enumerate(kopf, 1)]
    if fehler:
        text_ = '\n'.join(['STRUKTURPRÜFUNG FEHLGESCHLAGEN – es wurden keine Importdateien erzeugt.', '',
                            'Probleme:', *[f'  - {f}' for f in fehler], '',
                            'Ist der Aufbau der Mappe so gewollt, diesen Bericht an den Entwickler schicken,',
                            'damit das Programm angepasst wird. Die Mappe wurde nicht verändert.', '',
                            *diagnose, ''])
        protokoll.write_text(text_, encoding='utf-8-sig', newline='\r\n')
        print(text_)
        sys.exit(f'Abgebrochen. Vollständiger Bericht: {protokoll}')
    print(f'Strukturprüfung bestanden ({len(EINGABEBLOECKE)} Tabellen).')

    def spalte(tabelle, name):
        return [z.get(name) for z in tabellen.get(tabelle, []) if z.get(name) not in (None, '')]

    b = Bestand()
    b.aggregate = {str(k).strip() for k in spalte('tblAggregate', 'Kommission')}
    b.technik = {schluessel_aus_ref(a) for a in spalte('tblTechnik', 'Aggregat')}
    b.mitarbeiter = {str(n).strip() for n in spalte('tblMitarbeiter', 'Name')}
    for z in tabellen['tblKunden']:
        if z.get('Kunden-Nr') not in (None, '') and z.get('Name'):
            try:
                b.kunden[str(z['Name']).strip().lower()] = str(round(float(z['Kunden-Nr'])))
            except (TypeError, ValueError):
                print(f'Achtung: Kunden-Nr „{z["Kunden-Nr"]}“ bei „{z["Name"]}“ ist keine Zahl – ignoriert.')
    for z in tabellen['tblTermine']:
        d = z.get('Datum')
        d = d.strftime('%d.%m.%Y') if isinstance(d, (datetime, date)) else str(d or '').strip()
        kommission = schluessel_aus_ref(z.get('Aggregat'))
        if d and kommission:
            b.termine.add((d, kommission))
    return b


# ── Zeilen je Blatt ─────────────────────────────────────────

def termin_zeile(p, anlage, hinweis: Bericht) -> tuple[list[str], str] | None:
    s = (anlage or {}).get('stammdaten') or (p.get('anlage') or {}).get('stammdaten') or {}
    kommission = str(s.get('kommission') or '').strip()
    if not kommission:
        hinweis(f"Protokoll vom {datum(p.get('datum'))} ohne Kommission – übersprungen.")
        return None
    erledigt, geplant = arbeiten(p)
    liste = maengel(p)
    meta = p.get('meta') or {}
    zeile = [
        datum(p.get('datum')),
        ref_aggregat(s.get('bezeichnung'), kommission),
        text(meta.get('auftrag')),
        'erledigt',
        *[text(t) for t in techniker(meta.get('techniker'))],
        *[x(l in erledigt) for l in LEISTUNGEN],
        x(bool(liste) or geplant),
        ganzzahl(zaehlerstand(p, 'betriebsstunden')),
        ganzzahl(zaehlerstand(p, 'startzaehler')),
        bemerkung(liste, p.get('bemerkung')),
    ]
    assert len(zeile) == 19
    return zeile, kommission


def aggregat_zeile(a, kunden_nr) -> list[str]:
    s, z, v = a.get('stammdaten') or {}, a.get('zusatz') or {}, a.get('vertrag') or {}
    zeile = [
        text(s.get('kommission')), text(s.get('bezeichnung')), ref_kunde(s.get('kunde'), kunden_nr),
        text(s.get('standort')), '', '', '',
        text(s.get('hersteller')), text(s.get('typ')), text(s.get('seriennr')),
        ganzzahl(z.get('Leistung_kVA')), text(z.get('Motor_Typ')), text(z.get('Motor_NR')),
        ganzzahl(z.get('Menge_Kuehlmittel_intern')), text(z.get('Typ_Kuehlmittel_intern')),
        ganzzahl(z.get('Menge_Kuehlmittel_extern')), text(z.get('Typ_Kuehlmittel_extern')),
        *[ganzzahl(z.get(i)) for i in INTERVALLE],
        ja_nein(bool(v.get('aktiv'))), text(v.get('nummer')), geld(z.get('Wartungspauschale')),
        text(server_link(z.get('Server_Link'))), text(a.get('notizen')),
    ]
    assert len(zeile) == 29
    return zeile


def technik_zeile(a) -> list[str] | None:
    s, z = a.get('stammdaten') or {}, a.get('zusatz') or {}
    bat = next(iter(sektionen(a.get('pruefplan'), 'batterien')), {})
    gruppen = {g.get('id'): g for g in bat.get('gruppen', [])}
    lader = [l.get('name', '') if l.get('aktiv', True) else '' for l in bat.get('lader', [])] + ['', '']
    lader = ['' if re.fullmatch(r'Ladegerät \d', n or '') else n for n in lader]

    def batterie(gid):
        g = gruppen.get(gid)
        if not g or not zahl(g.get('anzahl')):
            return [''] * 6
        return [text(g.get('hersteller')), text(g.get('typ')), ganzzahl(g.get('anzahl')),
                ganzzahl(g.get('spannung')), ganzzahl(g.get('kapazitaet')), ja_nein(bool(g.get('wartungsfrei')))]

    zeile = [
        ref_aggregat(s.get('bezeichnung'), str(s.get('kommission') or '').strip()),
        *[text(z.get(k)) for k in ('Generator_Hersteller', 'Generator_Typ', 'Generator_Serien_NR', 'Generator_Regler_Typ',
                                   'Motorregler_Hersteller', 'Motorregler_Typ', 'NSA_Hersteller', 'NSA_Typ', 'NSA_Serien_NR')],
        text(lader[0]), '', text(lader[1]), '',
        *batterie('starterbatterie'), *batterie('steuerbatterie'),
    ]
    assert len(zeile) == 26
    # Ohne Gerätedaten (nur Standardwerte der Vorlage wie 2 × 12 V) keine Zeile anlegen
    hat_daten = any(zeile[1:14]) or any(zeile[i] for i in (14, 15, 18, 20, 21, 24))
    return zeile if hat_daten else None


# ── Ausgabe ─────────────────────────────────────────────────

def schreibe(ordner: Path, name: str, zeilen: list[list[str]]) -> Path | None:
    if not zeilen:
        return None
    pfad = ordner / name
    with pfad.open('w', encoding='utf-8-sig', newline='') as f:
        f.write(''.join('\t'.join(z) + '\r\n' for z in zeilen))
    return pfad


ANLEITUNG = """ÜBERNAHME IN „Wartungsdaten.xlsx“
====================================

Einmalig vorher (nur beim ersten Import):
In den Blättern unten müssen die Eingabespalten direkt nebeneinander stehen. Graue Formelspalten,
die dazwischen liegen, an den Rand schieben: Spaltenkopf anklicken, Umschalttaste gedrückt halten
und die Spalte am Rand ganz nach rechts neben die Tabelle ziehen. Das ist gefahrlos.
{formelspalten}
Für jede Datei, in dieser Reihenfolge:
{dateien}
So wird eine Datei eingefügt:
  1. Die Datei mit dem Editor öffnen (Doppelklick).
  2. Strg+A (alles markieren), dann Strg+C (kopieren).
  3. In Excel das genannte Blatt öffnen.
  4. In die erste leere Zeile direkt unter der Tabelle klicken, in die erste Spalte
     der Eingabespalten (bei „Termine“ also in die Spalte „Datum“).
  5. Strg+V (einfügen). Die Tabelle wächst automatisch, Formelspalten füllen sich selbst.
  6. Kurz prüfen: stehen die Werte in den richtigen Spalten? Wenn nicht: Strg+Z und Schritt 4 prüfen.

Jede Datei nur EIN Mal einfügen – Excel erkennt keine doppelten Zeilen.
"""

FORMELSPALTEN = {
    'Termine': 'Kommission, Bezeichnung, Kunde, Ort, ggf. Server-Link öffnen',
    'Aggregate': 'Kunden-Nr, Server-Link öffnen, Auswahlname',
    'Technische Daten': 'Kommission, Bezeichnung, Kunde, ggf. Server-Link öffnen',
}


def main():
    ap = argparse.ArgumentParser(description='Sicherung der Wartungs-App → Importdateien für Wartungsdaten.xlsx')
    ap.add_argument('sicherung', type=Path, help='Komplettsicherung der App (Wartung_Backup_….json)')
    ap.add_argument('--excel', type=Path, required=True, help='bestehende Wartungsdaten.xlsx (wird vorher geprüft)')
    ap.add_argument('--ziel', type=Path, help='Ausgabeordner (Standard: neben der Sicherung)')
    args = ap.parse_args()

    daten = lade_sicherung(args.sicherung)
    heute = date.today().isoformat()
    ordner = args.ziel or args.sicherung.with_name(f'Excel-Import_{heute}')
    ordner.mkdir(parents=True, exist_ok=True)
    bestand = lese_excel(args.excel, ordner / 'Strukturpruefung.txt')
    hinweis = Bericht()

    anlagen = {a['id']: a for a in daten.get('anlagen', [])}
    protokolle = sorted(daten.get('protokolle', []), key=lambda p: (p.get('datum') or '', p.get('id')))

    # Aggregate und Technische Daten
    aggregate, technik, neue_kommissionen = [], [], set()
    for a in sorted(anlagen.values(), key=lambda a: str(a.get('stammdaten', {}).get('kommission') or '')):
        s = a.get('stammdaten') or {}
        kommission = str(s.get('kommission') or '').strip()
        if not kommission:
            continue
        if kommission not in bestand.aggregate:
            nr = bestand.kunden.get(str(s.get('kunde') or '').strip().lower())
            if not nr:
                hinweis(f'Aggregat {kommission}: Kunde „{s.get("kunde") or "(leer)"}“ nicht im Blatt „Kunden“ – '
                        f'nicht exportiert. Kunde in Excel anlegen (Name genau wie in der App) und Programm erneut starten.')
                continue
            aggregate.append(aggregat_zeile(a, nr))
            neue_kommissionen.add(kommission)
        if kommission not in bestand.technik and (zeile := technik_zeile(a)):
            technik.append(zeile)

    # Termine
    termine, entwuerfe, doppelt, gesehen = [], 0, 0, set()
    namen = []
    for p in protokolle:
        if p.get('status') != 'abgeschlossen':
            entwuerfe += 1
            continue
        ergebnis = termin_zeile(p, anlagen.get(p.get('anlageId')), hinweis)
        if not ergebnis:
            continue
        zeile, kommission = ergebnis
        if (zeile[0], kommission) in bestand.termine:
            doppelt += 1
            continue
        if (zeile[0], kommission) in gesehen:
            hinweis(f'Mehrere Protokolle am {zeile[0]} für {kommission} – nur das erste exportiert.')
            continue
        gesehen.add((zeile[0], kommission))
        if kommission not in bestand.aggregate and kommission not in neue_kommissionen:
            hinweis(f'Termin {zeile[0]} für {kommission}: Aggregat fehlt in Excel – Zeile trotzdem exportiert, '
                    f'erst das Aggregat anlegen.')
        termine.append(zeile)
        namen += [n for n in zeile[4:7] if n and ',' not in n]

    mitarbeiter = [[n] for n in dict.fromkeys(namen) if n not in bestand.mitarbeiter]

    dateien = []
    for nr, (blatt, zeilen) in enumerate([('Mitarbeiter', mitarbeiter), ('Aggregate', aggregate),
                                          ('Technische Daten', technik), ('Termine', termine)], 1):
        pfad = schreibe(ordner, f'Import_{nr}_{blatt.replace(" ", "_")}_{heute}.txt', zeilen)
        if pfad:
            dateien.append((blatt, pfad, len(zeilen)))

    (ordner / 'Anleitung.txt').write_text(ANLEITUNG.format(
        formelspalten=''.join(f'  • {b}: {FORMELSPALTEN[b]}\n' for b, _, _ in dateien if b in FORMELSPALTEN),
        dateien=''.join(f'  {i}. {p.name}  →  Blatt „{b}“ ({n} Zeile{"" if n == 1 else "n"})\n'
                        for i, (b, p, n) in enumerate(dateien, 1)),
    ), encoding='utf-8-sig', newline='\r\n')

    hersteller = sorted({z[7] for z in aggregate if z[7]})
    if hersteller:
        hinweis(f'Hersteller müssen im Blatt „Listen“ unter „Aggregathersteller“ stehen (sonst dort ergänzen): '
                f'{", ".join(hersteller)}')
    if entwuerfe:
        hinweis(f'{entwuerfe} nicht abgeschlossene Protokolle (Entwürfe) übersprungen.')
    if doppelt:
        hinweis(f'{doppelt} Termine sind in Excel schon vorhanden und wurden übersprungen.')
    if hinweis.hinweise:
        (ordner / 'Hinweise.txt').write_text(''.join(f'- {h}\n' for h in hinweis.hinweise), encoding='utf-8-sig', newline='\r\n')

    print(f'Ausgabe: {ordner}')
    for blatt, pfad, n in dateien:
        print(f'  {pfad.name}: {n} Zeile{"" if n == 1 else "n"}')
    for h in hinweis.hinweise:
        print(f'  Hinweis: {h}')


if __name__ == '__main__':
    main()
