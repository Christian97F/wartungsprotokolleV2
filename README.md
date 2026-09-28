# Wartungsprotokolle

Offline-PWA (Vanilla JS, ES-Module, IndexedDB) für Wartungsprotokolle beliebiger Anlagen –
mit Vorlagen, anpassbarem Prüfplan je Anlage und PDF-Bericht direkt aus der App.

## Aufbau

```
index.html            App-Rahmen
sw.js                 Service Worker (offline, VERSION bei Änderungen erhöhen)
css/                  tokens → basis → layout → komponenten → screens, bericht (A4), druck
js/app.js             Start, Routen, Navigation
js/core/              db (IndexedDB), model (Datenmodell), migration (Altdaten v1),
                      router, shell (Kopfzeile), ui (Dialog/Toast/Menü), util, icons
js/sektionen/         Abschnitts-Typen (Strategie-Objekte, siehe registry.js):
                      checkliste, felder, tabelle, messreihe, batterien, aufgaben
js/vorlagen/          mitgelieferte Vorlagen (NEA, DIN 6280-13, USV, leer)
js/io/                austausch (Import/Export), bericht (HTML-Bericht für PDF)
js/screens/           Anlagen, Anlage-Editor, Prüfplan-Editor, Protokoll, Protokolle,
                      Bericht, Vorlagen, Daten
```

## Datenmodell

- **Vorlage**: Stammdaten-Feldgruppen + Abschnitte (`sektionen`).
- **Anlage**: Kern-Stammdaten, Zusatzfelder, eigener `pruefplan` (Kopie der Vorlage, frei anpassbar).
- **Protokoll**: Snapshot des aktiven Prüfplans (`plan`) + `werte` je Abschnitt, Mängel, Ergebnis,
  Unterschriften. Entwürfe übernehmen Änderungen am Prüfplan beim Öffnen, abgeschlossene nicht.

Neuer Abschnitts-Typ: Modul in `js/sektionen/` anlegen (Schnittstelle in `registry.js`) und dort registrieren.

## Import/Export

Ein Dateiformat (`format: "wartungsprotokolle", version: 2`) für Backup, Anlagen, Protokolle und Vorlagen.
Dateien der alten Version (v1, `_typ: …`) werden beim Import automatisch umgewandelt; die lokale
Datenbank wird beim ersten Start migriert (der alte Store `aggregate` bleibt als Sicherung erhalten).

## Lokal starten

```
python3 -m http.server 8000
```
→ http://localhost:8000
