import { Actor, log } from 'apify';
import { itunesSearchUrl, fromItunes, parseFeed, passesFilters } from './lib.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    keywords = ['marketing'],
    country = 'US',
    maxResultsPerKeyword = 50,
    maxResults = 200,
    onlyActive = true,
    activeDays = 90,
    minEpisodes = 5,
    requireEmail = true,
    language,
    excludeEmails = [],
} = input;

const optOut = new Set(excludeEmails.map((e) => e.toLowerCase().trim()));
const seen = new Set();
let pushed = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { tries = 3, timeoutMs = 20000 } = {}) {
    for (let i = 1; i <= tries; i++) {
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(timeoutMs),
                headers: { 'user-agent': 'Mozilla/5.0 (compatible; PodcastLeads/0.1)' },
            });
            if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (i === tries) throw err;
            await sleep(3000 * i);
        }
    }
}

outer: for (const term of keywords) {
    log.info(`Searching Apple Podcasts for "${term}"`);
    let results = [];
    try {
        const res = await fetchWithRetry(itunesSearchUrl({ term, country, limit: maxResultsPerKeyword * 3 }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        results = (await res.json()).results ?? [];
    } catch (err) {
        log.warning(`Search failed for "${term}": ${err.message}`);
        continue;
    }

    let perKeyword = 0;
    for (const r of results) {
        if (pushed >= maxResults) break outer;
        if (perKeyword >= maxResultsPerKeyword) break;
        const base = fromItunes(r);
        if (!base.feedUrl || seen.has(base.appleId)) continue;
        seen.add(base.appleId);

        let feed = {};
        try {
            const res = await fetchWithRetry(base.feedUrl, { tries: 2 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            feed = parseFeed(await res.text(), { activeDays });
        } catch (err) {
            log.debug(`Feed failed for ${base.title}: ${err.message}`);
            feed = { feedError: err.message };
        }

        feed.contactEmails = (feed.contactEmails ?? []).filter((e) => !optOut.has(e));
        if (feed.ownerEmail && optOut.has(feed.ownerEmail)) feed.ownerEmail = null;

        const row = { ...base, ...feed, searchKeyword: term, scrapedAt: new Date().toISOString() };
        if (!passesFilters(row, { onlyActive, minEpisodes, requireEmail, language })) continue;

        const event = row.contactEmails.length ? 'podcast-with-contact' : 'podcast-no-contact';
        await Actor.pushData(row, event);
        pushed++;
        perKeyword++;
        await sleep(250);
    }
    await sleep(3000); // stay under Apple's ~20 req/min search limit
}

log.info(`Done. ${pushed} podcasts saved.`);
await Actor.exit();
