import { Actor, log } from 'apify';
import { ProxyAgent } from 'undici';
import { normalizeDomain, pageText, findLegalLinks, extractLegalData, mergeResults } from './lib.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { domains = [], maxConcurrency = 10, includeNoData = true, timeoutSecs = 20, useProxy = true } = input;

const targets = [...new Set(domains.map(normalizeDomain).filter(Boolean))];
log.info(`Checking ${targets.length} domains`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Retry through Apify Proxy when a site blocks the direct request.
let proxyConfig = null;
if (useProxy) {
    proxyConfig = await Actor.createProxyConfiguration().catch((err) => {
        log.warning(`Proxy unavailable, using direct requests only: ${err.message}`);
        return null;
    });
}
const stats = { checked: 0, withData: 0, noData: 0, failed: 0, viaProxy: 0, errors: {} };

async function getOnce(url, dispatcher) {
    const res = await fetch(url, {
        redirect: 'follow',
        dispatcher,
        signal: AbortSignal.timeout(timeoutSecs * 1000),
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,fr,it,es,nl,pl,de;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error(`Not HTML (${type})`);
    return { html: await res.text(), finalUrl: res.url };
}

async function get(url) {
    try {
        return await getOnce(url);
    } catch (err) {
        if (!proxyConfig) throw err;
        const res = await getOnce(url, new ProxyAgent(await proxyConfig.newUrl()));
        stats.viaProxy++;
        return res;
    }
}

/** Tries the domain as given, then with or without "www.". */
async function getHome(domain) {
    const u = new URL(domain);
    const alt = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
    try {
        return await get(domain);
    } catch (err) {
        try { return await get(`${u.protocol}//${alt}`); } catch { throw err; }
    }
}

async function processDomain(domain) {
    const row = { domain, legalNoticeUrl: null, error: null };
    try {
        const home = await getHome(domain);
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
        row.error = err.name === 'TimeoutError' ? 'Timed out' : (err.cause?.code ?? err.message);
        row.hasLegalData = false;
        stats.failed++;
        stats.errors[row.error] = (stats.errors[row.error] ?? 0) + 1;
        log.warning(`${domain}: ${row.error}`);
    }
    stats.checked++;
    if (row.hasLegalData) stats.withData++;
    else if (!row.error) stats.noData++;
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

log.info(`Done. ${JSON.stringify(stats)}`);
await Actor.setValue('STATS', stats);
await Actor.exit();
