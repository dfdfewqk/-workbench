import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
for (const file of ['photos.js','faults.js']) {
  const source=readFileSync(new URL(`../docs/smart-maintenance/${file}`,import.meta.url),'utf8');
  const match=source.match(/const localTimestamp = value => \{[\s\S]*?\n  \};/);
  assert.ok(match, `${file} must format timestamps locally`);
  const formatter=runInNewContext(`${match[0]}\nlocalTimestamp`, {Date,Intl});
  const input='2026-10-29T03:44:00.000Z';
  const expected=new Intl.DateTimeFormat('ko-KR',{
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    ...(file==='faults.js'?{second:'2-digit'}:{}),hour12:false
  }).format(new Date(input));
  assert.equal(formatter(input), expected, `${file} must display the browser's local timestamp`);
  assert.equal(formatter(null),'시각 미상');
}
const photo=readFileSync(new URL('../docs/smart-maintenance/photos.js',import.meta.url),'utf8');
const fault=readFileSync(new URL('../docs/smart-maintenance/faults.js',import.meta.url),'utf8');
assert.ok(photo.includes('${localTimestamp(p.createdAt)}'));
assert.ok(photo.includes('${localTimestamp(p.hiddenAt)}'));
assert.ok(fault.includes('${localTimestamp(event.at)}'));
console.log('PASS: local timestamp formatting follows the runtime timezone (UTC, KST and others)');
