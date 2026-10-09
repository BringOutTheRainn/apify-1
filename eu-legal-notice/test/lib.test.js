import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, pageText, findLegalLinks, extractLegalData } from '../src/lib.js';

test('normalizeDomain', () => {
  assert.equal(normalizeDomain('Example.FR/about'), 'https://example.fr');
  assert.equal(normalizeDomain('http://www.x.it'), 'http://www.x.it');
  assert.equal(normalizeDomain('  '), null);
});

test('findLegalLinks ranks legal pages, ignores other hosts', () => {
  const html = `<a href="/mentions-legales">Mentions légales</a><a href="/privacy">Privacy</a>
    <a href="https://other.com/impressum">Impressum</a><a href="/legal/imprint#top">x</a>`;
  assert.deepEqual(findLegalLinks(html, 'https://shop.fr/'), ['https://shop.fr/mentions-legales', 'https://shop.fr/legal/imprint']);
});

test('FR mentions légales', () => {
  const t = pageText(`<p>Le site est édité par Boulangerie Dupont SAS au capital de 10 000 €</p>
    <p>RCS Paris 852 379 015 – SIRET 852 379 015 00012</p><p>TVA intracommunautaire : FR 45 852379015</p><p>contact@dupont.fr</p>`);
  const r = extractLegalData(t, { domain: 'https://dupont.fr' });
  assert.equal(r.registrationIds.siret, '852 379 015 00012');
  assert.equal(r.registrationIds.siren, '852379015');
  assert.deepEqual(r.vatIds, ['FR45852379015']);
  assert.equal(r.legalName, 'Boulangerie Dupont SAS');
  assert.equal(r.shareCapital, '10 000');
  assert.equal(r.country, 'FR');
  assert.ok(r.hasLegalData);
});

test('IT footer', () => {
  const r = extractLegalData('© 2026 Rossi Arredamenti S.r.l. - P.IVA 01234567890 - REA MI-1234567', {});
  assert.equal(r.registrationIds.partitaIva, '01234567890');
  assert.equal(r.legalName, 'Rossi Arredamenti S.r.l.');
  assert.equal(r.country, 'IT');
});

test('ES, NL, BE, PL, UK ids', () => {
  assert.equal(extractLegalData('Tienda Sol S.L. CIF: B-12345678').registrationIds.cif, 'B12345678');
  const nl = extractLegalData('KvK-nummer: 12345678 BTW NL123456789B01');
  assert.equal(nl.registrationIds.kvk, '12345678'); assert.deepEqual(nl.vatIds, ['NL123456789B01']);
  assert.equal(extractLegalData('Ondernemingsnummer: 0123.456.789').registrationIds.kbo, '0123456789');
  const pl = extractLegalData('Firma Sp. z o.o. NIP: 123-456-78-90, KRS 0000123456');
  assert.equal(pl.registrationIds.nip, '1234567890'); assert.equal(pl.registrationIds.krs, '0000123456');
  assert.equal(extractLegalData('Acme Widgets Ltd. Company number: 01234567').registrationIds.companyNumber, '01234567');
});

test('no data on a plain page', () => {
  const r = extractLegalData('Welcome to our shop! Call 123456789.', { domain: 'https://x.es' });
  assert.equal(r.hasLegalData, false);
  assert.equal(r.country, 'ES');
});
