import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSpokenDate } from '../src/lib/spokenDate.ts';
import { dateVoiceRows } from '../src/dateVoiceI18n.ts';

const today = new Date(2026, 9, 5);
const cases = [
  ['October 4, 2026', 'en', '2026-10-04'],
  ['October fourth twenty twenty five', 'en', '2025-10-04'],
  ['January twenty first two thousand twenty six', 'en', '2026-01-21'],
  ['today', 'en', '2026-10-05'],
  ['yesterday', 'en', '2026-10-04'],
  ['ayer', 'es', '2026-10-04'],
  ['10/4/2026', 'en', '2026-10-04'],
  ['31/10/2025', 'en', '2025-10-31'],
  ['४ अक्तूबर २०२६', 'hi', '2026-10-04'],
  ['٤ أكتوبر ٢٠٢٦', 'ar', '2026-10-04'],
  ['4 октября 2026', 'ru', '2026-10-04'],
  ['2026年10月4日', 'ja', '2026-10-04'],
  ['2026年1月10日', 'ja', '2026-01-10'],
  ['2026年10月4日', 'zh-CN', '2026-10-04'],
  ['ngày 4 tháng 10 năm 2026', 'vi', '2026-10-04'],
  ['۱۰/۰۴/۲۰۲۶', 'fa', '2026-10-04'],
];

for (const [spoken, language, expected] of cases) {
  test(`recognizes "${spoken}" in ${language}`, () => {
    assert.deepEqual(parseSpokenDate(spoken, language, today), { value: expected });
  });
}

test('leaves unclear, impossible, and future dates unapplied', () => {
  assert.deepEqual(parseSpokenDate('next Thursday', 'en', today), { error: 'invalid' });
  assert.deepEqual(parseSpokenDate('February 29, 2025', 'en', today), { error: 'invalid' });
  assert.deepEqual(parseSpokenDate('10/6/2026', 'en', today), { error: 'future' });
});

test('invalid and future date guidance is localized', () => {
  for (const [key, values] of Object.entries(dateVoiceRows)) {
    assert.equal(values.length, 13, key);
    assert.ok(values.every((value) => value.trim()), key);
  }
});