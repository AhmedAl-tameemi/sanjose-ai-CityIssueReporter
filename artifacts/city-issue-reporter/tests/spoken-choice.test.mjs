import assert from 'node:assert/strict';
import test from 'node:test';
import { matchSpokenChoice } from '../src/lib/spokenChoice.ts';
import { voiceRows } from '../src/voiceI18n.ts';

const options = [
  { value: 'Potholes', labels: ['Potholes', 'Baches'] },
  { value: 'Speeding', labels: ['Speeding', 'Exceso de velocidad'] },
  { value: 'Other', labels: ['Other', 'Otro'] },
];

test('spoken choices tolerate punctuation, case and introductory words', () => {
  assert.equal(matchSpokenChoice('I want to report POTHOLES.', options), 'Potholes');
  assert.equal(matchSpokenChoice('Exceso de velocidad.', options), 'Speeding');
});
test('unknown or ambiguous speech never changes a choice', () => {
  assert.equal(matchSpokenChoice('Otherwise everything is fine', options), undefined);
  assert.equal(matchSpokenChoice('Potholes or speeding', options), undefined);
  assert.equal(matchSpokenChoice('', options), undefined);
});
test('localized choices tolerate accents', () => {
  assert.equal(matchSpokenChoice('Todos los días.', [
    { value: 'daily', labels: ['Todos los días'] },
    { value: 'once', labels: ['Una vez'] },
  ]), 'daily');
});
test('all voice input copy covers the supported languages', () => {
  for (const [key, values] of Object.entries(voiceRows)) {
    assert.equal(values.length, 13, key);
    assert.ok(values.every((value) => value.trim()), key);
  }
});