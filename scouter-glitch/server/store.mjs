import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError, DEFAULT_PROFILE, validateOpportunity, validateProfile } from './domain.mjs';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS opportunities (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT, data TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS provider_ref ON opportunities(source, external_id) WHERE external_id <> \'\'; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    if (path !== ':memory:') chmodSync(path, 0o600);
  }
  list() { return this.db.prepare('SELECT data FROM opportunities').all().map(row => JSON.parse(row.data)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id) { const row = this.db.prepare('SELECT data FROM opportunities WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  save(input, id) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Opportunity details are required.');
    const existing = id ? this.get(id) : null;
    if (id && !existing) throw new AppError('Opportunity not found.', 404);
    if (!id && input.externalId && ['google', 'youtube'].includes(input.source)) {
      const duplicate = this.db.prepare('SELECT id FROM opportunities WHERE source=? AND external_id=?').get(input.source, input.externalId);
      if (duplicate) throw new AppError('This target is already saved in your pipeline.', 409, 'duplicate');
    }
    const data = validateOpportunity(input, existing);
    this.db.prepare('INSERT INTO opportunities(id,source,external_id,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(data.id, data.source, data.externalId, JSON.stringify(data));
    return data;
  }
  remove(id) { if (!this.get(id)) throw new AppError('Opportunity not found.', 404); this.db.prepare('DELETE FROM opportunities WHERE id=?').run(id); }
  setting(key, fallback = null) { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  set(key, value) { this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  profile() { return this.setting('profile', DEFAULT_PROFILE); }
  export() { return { version: 1, exportedAt: new Date().toISOString(), profile: this.profile(), opportunities: this.list() }; }
  restore(input) {
    if (input?.version !== 1 || !Array.isArray(input.opportunities) || input.opportunities.length > 3000) throw new AppError('Choose a Scouter version 1 backup.');
    const profile = validateProfile(input.profile || DEFAULT_PROFILE);
    if (profile.currency !== this.profile().currency && this.list().some(o => o.payment || o.budget || o.expenses.length || o.quote.lines.length)) throw new AppError('This backup uses a different currency. Import into a separate workspace to keep money records accurate.');
    const validated = input.opportunities.map(item => validateOpportunity(item));
    let imported = 0, skipped = 0;
    this.db.exec('BEGIN');
    try {
      for (let i = 0; i < validated.length; i++) {
        const inputItem = input.opportunities[i];
        if (inputItem.id && this.get(inputItem.id)) { skipped++; continue; }
        const v = validated[i];
        if (v.externalId && this.db.prepare('SELECT id FROM opportunities WHERE source=? AND external_id=?').get(v.source, v.externalId)) { skipped++; continue; }
        if (typeof inputItem.id === 'string' && /^[\da-f-]{36}$/i.test(inputItem.id)) v.id = inputItem.id;
        this.db.prepare('INSERT INTO opportunities VALUES(?,?,?,?)').run(v.id, v.source, v.externalId, JSON.stringify(v));
        imported++;
      }
      this.set('profile', profile);
      this.db.exec('COMMIT');
      return { imported, skipped };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
