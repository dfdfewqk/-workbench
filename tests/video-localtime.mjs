import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
for (const file of ['photos.js','faults.js']) {
  const source=readFileSync(new URL(`../docs/smart-maintenance/${file}`,import.meta.url),'utf8');
  const match=source.match(/const localTimestamp = value => \{[\s\S]*?\n  \};/);
  assert.ok(match, `${file} must format timestamps locally`);
  const formatter=runInNewContext(`${match[0]}\nlocalTimestamp`, {Date,Intl});
  assert.match(formatter('2026-10-29T03:44:00.000Z'), /12:44/, `${file} must display local KST 12:44`);
  assert.equal(formatter(null),'시각 미상');
}
const photo=readFileSync(new URL('../docs/smart-maintenance/photos.js',import.meta.url),'utf8');
const fault=readFileSync(new URL('../docs/smart-maintenance/faults.js',import.meta.url),'utf8');
assert.ok(photo.includes('${localTimestamp(p.createdAt)}'));
assert.ok(photo.includes('${localTimestamp(p.hiddenAt)}'));
assert.ok(fault.includes('${localTimestamp(event.at)}'));
console.log('PASS video local timestamps: 03:44 UTC is displayed as 12:44 KST; hidden/event timestamps use local time');
