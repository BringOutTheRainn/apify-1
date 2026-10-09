import { Actor, log } from 'apify';
import { normalizeDomain, pageText, findLegalLinks, extractLegalData, mergeResults } from './lib.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { domains = [], maxConcurrency = 10, includeNoData = false, timeoutSecs = 20 } = input;

const targets = [...new Set(domains.map(normalizeDomain).filter(Boolean))];
log.info(`Checking ${targets.length} domains`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function get(url) {
    const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutSecs * 1000),
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,fr,it,es,nl,pl,de;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error(`Not HTML (${type})`);
    return { html: await res.text(), finalUrl: res.url };
}

async function processDomain(domain) {
    const row = { domain, legalNoticeUrl: null, error: null };
    try {
        const home = await get(domain);
        let data = extractLegalData(pageText(home.html), { domain });
        for (const link of findLegalLinks(home.html, home.finalUrl)) {
            try {
                const page = await get(link);
                const found = extractLegalData(pageText(page.html), { domain });
                if (found.hasLegalData || !row.legalNoticeUrl) row.legalNoticeUrl = link;
                data = mergeResults(found, data);
                if (found.hasLegalData) break;
            } catch (err) {
                log.debug(`${link}: ${err.message}`);
            }
        }
        Object.assign(row, data);
    } catch (err) {
        row.error = err.message;
        row.hasLegalData = false;
    }
    row.checkedAt = new Date().toISOString();

    if (row.hasLegalData) await Actor.pushData(row, 'domain-with-legal-data');
    else if (includeNoData) await Actor.pushData(row); // free: no charge when nothing was found
}

let next = 0;
await Promise.all(
    Array.from({ length: Math.min(maxConcurrency, targets.length) }, async () => {
        while (next < targets.length) {
            const domain = targets[next++];
            await processDomain(domain);
            if (next % 50 === 0) log.info(`Progress: ${next}/${targets.length}`);
        }
    }),
);

log.info(`Done. ${targets.length} domains checked.`);
await Actor.exit();
