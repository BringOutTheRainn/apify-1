import { Actor, log } from 'apify';
import { itunesSearchUrl, fromItunes, parseFeed, passesFilters, emailsFromHtml, contactPageUrls, SEARCH_ATTRIBUTES } from './lib.js';

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
    checkWebsites = true,
    language,
    excludeEmails = [],
    maxConcurrency = 8,
} = input;

const optOut = new Set(excludeEmails.map((e) => e.toLowerCase().trim()));
const seen = new Set();
const stats = { candidates: 0, feedFailed: 0, inactive: 0, tooFewEpisodes: 0, noEmail: 0, wrongLanguage: 0, emailFromWebsite: 0, saved: 0 };
let saved = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { tries = 3, timeoutMs = 20000 } = {}) {
    for (let i = 1; i <= tries; i++) {
        try {
            const res = await fetch(url, {
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
                headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
            });
            if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (i === tries) throw err;
            await sleep(3000 * i);
        }
    }
}

async function searchApple(term) {
    const found = [];
    for (const attribute of SEARCH_ATTRIBUTES) {
        try {
            const res = await fetchWithRetry(itunesSearchUrl({ term, country, limit: 200, attribute }));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            found.push(...((await res.json()).results ?? []));
        } catch (err) {
            log.warning(`Search "${term}" (${attribute ?? 'all'}) failed: ${err.message}`);
        }
        await sleep(3500); // Apple allows ~20 searches per minute
    }
    return found;
}

async function websiteEmails(website) {
    for (const url of contactPageUrls(website)) {
        try {
            const res = await fetchWithRetry(url, { tries: 1, timeoutMs: 12000 });
            if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) continue;
            const emails = emailsFromHtml(await res.text());
            if (emails.length) return emails;
        } catch { /* try the next page */ }
    }
    return [];
}

/** Returns true if a row was saved. */
async function processShow(r, term) {
    const base = fromItunes(r);
    let feed;
    try {
        const res = await fetchWithRetry(base.feedUrl, { tries: 2 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        feed = parseFeed(await res.text(), { activeDays });
    } catch (err) {
        stats.feedFailed++;
        feed = { feedError: err.message, contactEmails: [] };
    }
    const row = { ...base, ...feed, searchKeyword: term };

    // Cheap filters first, so we only visit websites for shows that could qualify.
    if (onlyActive && !row.isActive) { stats.inactive++; return false; }
    if ((row.episodeCount ?? row.appleEpisodeCount ?? 0) < minEpisodes) { stats.tooFewEpisodes++; return false; }
    if (!passesFilters(row, { language })) { stats.wrongLanguage++; return false; }

    row.contactEmails = (row.contactEmails ?? []).filter((e) => !optOut.has(e));
    if (row.ownerEmail && optOut.has(row.ownerEmail)) row.ownerEmail = null;
    row.emailSource = row.contactEmails.length ? 'rss' : null;

    if (!row.contactEmails.length && checkWebsites && row.website) {
        const emails = (await websiteEmails(row.website)).filter((e) => !optOut.has(e));
        if (emails.length) {
            row.contactEmails = emails;
            row.emailSource = 'website';
            stats.emailFromWebsite++;
        }
    }
    if (requireEmail && !row.contactEmails.length) { stats.noEmail++; return false; }

    if (saved >= maxResults) return false;
    saved++;
    row.scrapedAt = new Date().toISOString();
    await Actor.pushData(row, row.contactEmails.length ? 'podcast-with-contact' : 'podcast-no-contact');
    stats.saved++;
    return true;
}

for (const term of keywords) {
    if (saved >= maxResults) break;
    log.info(`Searching Apple Podcasts for "${term}"`);
    const queue = (await searchApple(term)).filter((r) => {
        if (!r.feedUrl || seen.has(r.collectionId)) return false;
        seen.add(r.collectionId);
        return true;
    });
    stats.candidates += queue.length;
    log.info(`"${term}": ${queue.length} unique shows to check`);

    let perKeyword = 0;
    await Promise.all(
        Array.from({ length: maxConcurrency }, async () => {
            while (queue.length && perKeyword < maxResultsPerKeyword && saved < maxResults) {
                if (await processShow(queue.shift(), term)) perKeyword++;
            }
        }),
    );
}

log.info(`Done. ${JSON.stringify(stats)}`);
await Actor.setValue('STATS', stats);
await Actor.exit();
