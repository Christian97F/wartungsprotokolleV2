import { DB } from '../core/db.js';
import { BUILTIN_VORLAGEN } from './builtin.js';
import { klon } from '../core/util.js';

export async function alleVorlagen() {
  const eigene = await DB.vorlagen.alle();
  eigene.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return [...BUILTIN_VORLAGEN.map(klon), ...eigene];
}

export async function holeVorlage(id) {
  const b = BUILTIN_VORLAGEN.find(v => v.id === id);
  return b ? klon(b) : DB.vorlagen.hole(id);
}
