import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GUEST_RE = /\b(interview|guest|with|ft\.|feat\.|featuring|conversation|talks?|joins?)\b/i;
const SOCIAL_RE = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com)\/[^\s"'<>)]+/gi;

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
    const s = v == null ? null : typeof v === 'object' ? v['#text'] : v;
    return s == null ? null : String(s).trim() || null;
};

export function itunesSearchUrl({ term, country = 'US', limit = 200, genreId, attribute }) {
    const u = new URL('https://itunes.apple.com/search');
    u.searchParams.set('term', term);
    u.searchParams.set('media', 'podcast');
    u.searchParams.set('entity', 'podcast');
    u.searchParams.set('country', country);
    u.searchParams.set('limit', String(Math.min(limit, 200)));
    if (genreId) u.searchParams.set('genreId', String(genreId));
    if (attribute) u.searchParams.set('attribute', attribute);
    return u.toString();
}

/** Maps one iTunes Search API result to the base output row. */
export function fromItunes(r) {
    return {
        title: r.collectionName ?? r.trackName ?? null,
        author: r.artistName ?? null,
        appleId: r.collectionId ?? null,
        appleUrl: r.collectionViewUrl ?? null,
        feedUrl: r.feedUrl ?? null,
        artworkUrl: r.artworkUrl600 ?? r.artworkUrl100 ?? null,
        primaryGenre: r.primaryGenreName ?? null,
        genres: (r.genres ?? []).filter((g) => g !== 'Podcasts'),
        country: r.country ?? null,
        explicit: r.collectionExplicitness === 'explicit',
        appleEpisodeCount: r.trackCount ?? null,
        appleLastReleaseDate: r.releaseDate ?? null,
    };
}

/** Parses an RSS feed and returns contact + activity fields. */
export function parseFeed(xml, { now = Date.now(), activeDays = 90 } = {}) {
    const doc = parser.parse(xml);
    const ch = doc?.rss?.channel;
    if (!ch) throw new Error('Not an RSS feed');

    const owner = ch['itunes:owner'] ?? {};
    const items = asArray(ch.item);
    const dates = items
        .map((i) => Date.parse(text(i.pubDate) ?? ''))
        .filter((d) => !Number.isNaN(d))
        .sort((a, b) => b - a);

    let avgDaysBetweenEpisodes = null;
    if (dates.length >= 2) {
        const span = Math.min(dates.length, 20);
        avgDaysBetweenEpisodes = Math.round(((dates[0] - dates[span - 1]) / (span - 1) / 86400000) * 10) / 10;
    }

    const description = [text(ch.description), text(ch['itunes:summary'])].filter(Boolean).join(' ');
    const ownerEmail = text(owner['itunes:email']);
    const emails = new Set();
    if (ownerEmail) emails.add(ownerEmail.toLowerCase());
    for (const m of description.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());

    const titles = items.slice(0, 30).map((i) => text(i.title) ?? '');
    const guestHits = titles.filter((t) => GUEST_RE.test(t)).length;
    const lastEpisodeDate = dates[0] ? new Date(dates[0]).toISOString() : null;

    return {
        ownerName: text(owner['itunes:name']),
        ownerEmail: ownerEmail?.toLowerCase() ?? null,
        contactEmails: [...emails],
        website: text(asArray(ch.link).find((l) => typeof l === 'string' || l?.['#text'])) ?? null,
        language: text(ch.language),
        socialLinks: [...new Set(description.match(SOCIAL_RE) ?? [])],
        episodeCount: items.length,
        lastEpisodeDate,
        avgDaysBetweenEpisodes,
        isActive: dates[0] ? now - dates[0] <= activeDays * 86400000 : false,
        guestInterviewScore: titles.length ? Math.round((guestHits / titles.length) * 100) / 100 : null,
    };
}

export function passesFilters(row, { onlyActive, minEpisodes = 0, requireEmail, language }) {
    if (onlyActive && !row.isActive) return false;
    if ((row.episodeCount ?? row.appleEpisodeCount ?? 0) < minEpisodes) return false;
    if (requireEmail && !row.contactEmails?.length) return false;
    if (language && row.language && !row.language.toLowerCase().startsWith(language.toLowerCase())) return false;
    return true;
}

const JUNK_EMAIL_RE = /(example\.|sentry|wixpress|godaddy|domain\.com|email\.com|yourdomain|@2x|\.(png|jpe?g|gif|webp|svg)$|noreply|no-reply|privacy@|abuse@|dmca@)/i;

/** Pulls plausible contact emails out of an HTML page (mailto links first, then visible text). */
export function emailsFromHtml(html) {
    const out = new Set();
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
        try { out.add(decodeURIComponent(m[1]).toLowerCase()); } catch { /* bad encoding */ }
    }
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    for (const m of text.match(EMAIL_RE) ?? []) out.add(m.toLowerCase());
    return [...out].filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !JUNK_EMAIL_RE.test(e));
}

/** Contact-page URLs worth checking on a show's website. */
export function contactPageUrls(website) {
    let base;
    try { base = new URL(website); } catch { return []; }
    if (/(apple|spotify|anchor|podbean|buzzsprout|libsyn|simplecast|megaphone|omny|iheart|soundcloud|youtube|transistor|captivate|acast|spreaker)\./i.test(base.hostname)) return [];
    return [base.origin + '/', `${base.origin}/contact`, `${base.origin}/contact-us`, `${base.origin}/about`];
}

export const SEARCH_ATTRIBUTES = [null, 'descriptionTerm', 'keywordsTerm'];
