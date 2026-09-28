import { DB } from '../core/db.js';

export async function alleVorlagen() {
  const liste = await DB.vorlagen.alle();
  return liste.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export const LEERE_VORLAGE = { id: 'leer', name: 'Leere Vorlage', kategorie: 'Allgemein',
  beschreibung: 'Ohne Prüfpunkte – der Prüfplan wird komplett selbst aufgebaut.', stammdaten: [], sektionen: [] };

// „Leer“ steht immer zur Verfügung, auch wenn die Vorlage gelöscht wurde
export async function holeVorlage(id) {
  return (await DB.vorlagen.hole(id)) || (id === 'leer' ? structuredClone(LEERE_VORLAGE) : undefined);
}

export async function vorlagenZurAuswahl() {
  const liste = await alleVorlagen();
  return liste.some(v => v.id === 'leer') ? liste : [...liste, structuredClone(LEERE_VORLAGE)];
}
