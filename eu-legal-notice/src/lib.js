import * as cheerio from 'cheerio';

// Link text or URL fragments that point at a company's legal-notice page, per language.
const LEGAL_LINK_RE = new RegExp(
    [
        'mentions[\\s_-]*l[eé]gales', 'informations[\\s_-]*l[eé]gales', // FR, BE-fr
        'note[\\s_-]*legali', 'informazioni[\\s_-]*legali', 'dati[\\s_-]*societari', // IT
        'aviso[\\s_-]*legal', 'nota[\\s_-]*legal', 'informaci[oó]n[\\s_-]*legal', // ES, PT
        'colofon', 'disclaimer', 'juridische', 'wettelijke', // NL, BE-nl
        'informacje[\\s_-]*prawne', 'nota[\\s_-]*prawna', 'dane[\\s_-]*firmy', // PL
        'impressum', 'imprint', 'legal[\\s_-]*notice', 'legal[\\s_-]*information', 'company[\\s_-]*information', // DE, EN
    ].join('|'),
    'i',
);

const ENTITY_SUFFIX = String.raw`(?:S\.?A\.?S\.?U?|S\.?A\.?R\.?L\.?|E\.?U\.?R\.?L\.?|S\.?C\.?I\.?|S\.?A\.?|S\.?r\.?l\.?s?|S\.?p\.?A\.?|S\.?n\.?c\.?|S\.?L\.?U?|S\.?Coop\.?|B\.?V\.?|N\.?V\.?|V\.?O\.?F\.?|B\.?V\.?B\.?A\.?|S\.?P\.?R\.?L\.?|Sp\.? ?z ?o\.? ?o\.?|S\.?K\.?A\.?|Ltd\.?|Limited|LLP|PLC|GmbH|UG|AG|KG|Lda\.?)`;
const ENTITY_RE = new RegExp(String.raw`([A-Z0-9À-Ý][\w&'’À-ÿ.\- ]{1,60}?\s(?:${ENTITY_SUFFIX}))(?=[\s,.;:)]|$)`, 'gu');

const CONNECTORS = new Set(['&', 'and', 'et', 'e', 'y', 'de', 'di', 'del', 'della', 'des', 'du', 'van', 'von', 'der', 'den', 'i']);
const STOP = new Set(['©', 'copyright', 'by', 'par', 'da', 'por', 'door', 'the', 'la', 'le', 'les', 'il', 'el', 'het', 'die']);

/** Keeps only the capitalised run of words that ends in the legal-form suffix. */
function trimEntity(raw) {
    const words = raw.split(' ');
    let start = words.length - 1; // the suffix
    for (let i = words.length - 2; i >= 0; i--) {
        const w = words[i];
        if (STOP.has(w.toLowerCase()) || /^\d{4}$/.test(w)) break;
        if (/^[A-Z0-9À-Ý&]/.test(w) || (CONNECTORS.has(w.toLowerCase()) && i > 0 && /^[A-Z0-9À-Ý]/.test(words[i - 1]))) start = i;
        else break;
    }
    while (start < words.length - 1 && CONNECTORS.has(words[start].toLowerCase())) start++;
    return start < words.length - 1 ? words.slice(start).join(' ') : null;
}

const digits = (s) => s.replace(/\D/g, '');

/** Registration-number patterns. Each needs a nearby label so random numbers don't match. */
const ID_PATTERNS = [
    { country: 'FR', field: 'siret', re: /\bSIRET\s*(?:n[°o]\.?|:)?\s*:?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/i },
    { country: 'FR', field: 'siren', re: /\b(?:SIREN|RCS(?:\s+[A-ZÀ-Ý][\w'-]+(?:\s[\w'-]+)?)?)\s*(?:n[°o]\.?|:)?\s*:?\s*([A-Z]?\s?\d{3}\s?\d{3}\s?\d{3})\b/i, clean: (v) => digits(v) },
    { country: 'IT', field: 'partitaIva', re: /\b(?:P\.?\s?IVA|Partita\s+IVA|C\.?F\.?\s*(?:e|\/)\s*P\.?\s?IVA)\s*[:.]?\s*(?:IT\s?)?(\d{11})\b/i },
    { country: 'IT', field: 'rea', re: /\bR\.?E\.?A\.?\s*[:.]?\s*(?:n\.?\s*)?([A-Z]{2}\s?[-–]?\s?\d{4,7})\b/i },
    { country: 'ES', field: 'cif', re: /\b(?:C\.?I\.?F\.?|N\.?I\.?F\.?)\s*[:.]?\s*(?:ES\s?)?([A-HJNP-SUVW][-\s]?\d{7}[-\s]?[0-9A-J])\b/i, clean: (v) => v.replace(/[-\s]/g, '').toUpperCase() },
    { country: 'NL', field: 'kvk', re: /\b(?:KvK|Kamer\s+van\s+Koophandel|KvK-nummer|CoC)\s*(?:nr\.?|nummer|number)?\s*[:.]?\s*(\d{8})\b/i },
    { country: 'BE', field: 'kbo', re: /\b(?:KBO|BCE|Ondernemingsnummer|Num[eé]ro\s+d['’]entreprise|RPR|RPM)\s*[:.]?\s*(?:BE\s?)?(0?\d{3}[.\s]?\d{3}[.\s]?\d{3})\b/i, clean: (v) => digits(v).padStart(10, '0') },
    { country: 'PL', field: 'nip', re: /\bNIP\s*[:.]?\s*(?:PL\s?)?(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}|\d{3}[-\s]?\d{2}[-\s]?\d{2}[-\s]?\d{3})\b/i, clean: digits },
    { country: 'PL', field: 'krs', re: /\bKRS\s*[:.]?\s*(?:nr\.?\s*)?(\d{10})\b/i },
    { country: 'PL', field: 'regon', re: /\bREGON\s*[:.]?\s*(\d{9}|\d{14})\b/i },
    { country: 'UK', field: 'companyNumber', re: /\bCompany\s+(?:registration\s+)?(?:number|no\.?|reg\.?\s*no\.?)\s*[:.]?\s*((?:SC|NI|OC|SO|NC|R0)?\d{6,8})\b/i },
    { country: 'DE', field: 'handelsregister', re: /\b(HR[AB]\s?\d{3,7}(?:\s?[A-Z]{1,2})?)\b/ },
    { country: 'PT', field: 'nipc', re: /\bN\.?I\.?P\.?C\.?\s*[:.]?\s*(?:PT\s?)?(\d{9})\b/i },
];

const VAT_RE = /\b(ATU\d{8}|BE\s?[01]\d{3}[.\s]?\d{3}[.\s]?\d{3}|DE\s?\d{9}|ES\s?[A-Z0-9]\d{7}[A-Z0-9]|FR\s?[0-9A-HJ-NP-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3}|GB\s?\d{3}\s?\d{4}\s?\d{2}|IT\s?\d{11}|NL\s?\d{9}\s?B\s?\d{2}|PL\s?\d{10}|PT\s?\d{9}|IE\s?\d{7}[A-W][A-I]?|LU\s?\d{8}|DK\s?\d{8}|SE\s?\d{12}|FI\s?\d{8}|AT\s?U\d{8})\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CAPITAL_RE = /capital(?:e)?\s+(?:social\s+)?(?:de\s+|di\s+|sociale\s+(?:di\s+)?|i\.?v\.?\s+)?(?:€\s?)?([\d][\d\s.,]*\d)\s?(?:€|euros?|EUR)/i;

const TLD_COUNTRY = { fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', be: 'BE', pl: 'PL', uk: 'UK', de: 'DE', at: 'AT', ch: 'CH', pt: 'PT', ie: 'IE', lu: 'LU' };

export function normalizeDomain(input) {
    let s = String(input).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        return `${u.protocol}//${u.hostname.toLowerCase()}`;
    } catch {
        return null;
    }
}

export function pageText(html) {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();
    $('br, p, div, li, td, tr, h1, h2, h3, h4, footer, address').append('\n');
    return $('body').text().replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Returns up to `max` same-site URLs that look like legal-notice pages, best first. */
export function findLegalLinks(html, baseUrl, max = 2) {
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);
    const scored = new Map();
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const label = $(el).text().trim();
        if (!href || /^(mailto|tel|javascript):/i.test(href)) return;
        let url;
        try { url = new URL(href, base); } catch { return; }
        if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return;
        const inLabel = LEGAL_LINK_RE.test(label);
        const inHref = LEGAL_LINK_RE.test(decodeURIComponent(url.pathname));
        if (!inLabel && !inHref) return;
        url.hash = '';
        const score = (inLabel ? 2 : 0) + (inHref ? 1 : 0) + (/privacy|cookie|privacidad|confidentialit/i.test(label) ? -2 : 0);
        const key = url.toString();
        scored.set(key, Math.max(score, scored.get(key) ?? -Infinity));
    });
    return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([u]) => u);
}

export function extractLegalData(text, { domain } = {}) {
    const ids = {};
    const countries = [];
    for (const p of ID_PATTERNS) {
        if (ids[p.field]) continue;
        const m = text.match(p.re);
        if (!m) continue;
        const raw = m[1].trim();
        ids[p.field] = p.clean ? p.clean(raw) : raw.replace(/\s+/g, ' ');
        countries.push(p.country);
    }
    // SIRET contains SIREN.
    if (ids.siret && !ids.siren) ids.siren = digits(ids.siret).slice(0, 9);

    const vatIds = [...new Set((text.match(VAT_RE) ?? []).map((v) => v.replace(/[\s.]/g, '').toUpperCase()))];

    const entities = [...text.matchAll(ENTITY_RE)]
        .map((m) => trimEntity(m[1].replace(/\s+/g, ' ').trim()))
        .filter(Boolean)
        .filter((e) => e.split(' ').length <= 8 && !/\b(?:cookie|www|http)\b/i.test(e));
    const entityCounts = entities.reduce((acc, e) => acc.set(e, (acc.get(e) ?? 0) + 1), new Map());
    const legalName = [...entityCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null;

    const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))].filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/.test(e));
    const capitalMatch = text.match(CAPITAL_RE);

    const tld = domain ? new URL(domain).hostname.split('.').pop() : null;
    const country = countries[0] ?? (vatIds[0] ? vatIds[0].slice(0, 2).replace('GB', 'UK') : null) ?? TLD_COUNTRY[tld] ?? null;

    return {
        legalName,
        country,
        registrationIds: ids,
        vatIds,
        shareCapital: capitalMatch ? capitalMatch[1].trim() : null,
        emails,
        hasLegalData: Object.keys(ids).length > 0 || vatIds.length > 0,
    };
}

export function mergeResults(a, b) {
    return {
        legalName: a.legalName ?? b.legalName,
        country: a.country ?? b.country,
        registrationIds: { ...b.registrationIds, ...a.registrationIds },
        vatIds: [...new Set([...a.vatIds, ...b.vatIds])],
        shareCapital: a.shareCapital ?? b.shareCapital,
        emails: [...new Set([...a.emails, ...b.emails])],
        hasLegalData: a.hasLegalData || b.hasLegalData,
    };
}
