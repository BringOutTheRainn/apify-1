import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, fromItunes, passesFilters, itunesSearchUrl, emailsFromHtml, contactPageUrls } from '../src/lib.js';

const now = Date.parse('2026-10-07T00:00:00Z');
const feed = `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Growth Talks</title><link>https://growthtalks.fm</link><language>en-us</language>
<description>Weekly chats. Book us: hello@growthtalks.fm https://twitter.com/growthtalks</description>
<itunes:owner><itunes:name>Jane Host</itunes:name><itunes:email>Jane@GrowthTalks.fm</itunes:email></itunes:owner>
<item><title>Interview with Sam Lee</title><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Solo: pricing</title><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>Guest: Ana on SEO</title><pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

test('parseFeed extracts contacts and activity', () => {
  const r = parseFeed(feed, { now });
  assert.equal(r.ownerEmail, 'jane@growthtalks.fm');
  assert.deepEqual(r.contactEmails.sort(), ['hello@growthtalks.fm', 'jane@growthtalks.fm']);
  assert.equal(r.website, 'https://growthtalks.fm');
  assert.equal(r.episodeCount, 3);
  assert.equal(r.avgDaysBetweenEpisodes, 7);
  assert.equal(r.isActive, true);
  assert.equal(r.guestInterviewScore, 0.67);
  assert.deepEqual(r.socialLinks, ['https://twitter.com/growthtalks']);
});

test('parseFeed handles a single item and no owner', () => {
  const r = parseFeed('<rss><channel><title>x</title><item><title>a</title><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>', { now });
  assert.equal(r.episodeCount, 1);
  assert.equal(r.isActive, false);
  assert.equal(r.ownerEmail, null);
  assert.deepEqual(r.contactEmails, []);
});

test('parseFeed rejects non-RSS', () => assert.throws(() => parseFeed('<html></html>')));

test('fromItunes maps fields', () => {
  const r = fromItunes({ collectionName: 'P', collectionId: 1, feedUrl: 'f', genres: ['Business', 'Podcasts'], trackCount: 9 });
  assert.equal(r.title, 'P'); assert.deepEqual(r.genres, ['Business']); assert.equal(r.appleEpisodeCount, 9);
});

test('filters', () => {
  const row = { isActive: true, episodeCount: 10, contactEmails: ['a@b.co'], language: 'en-us' };
  assert.ok(passesFilters(row, { onlyActive: true, minEpisodes: 5, requireEmail: true, language: 'en' }));
  assert.ok(!passesFilters({ ...row, contactEmails: [] }, { requireEmail: true }));
  assert.ok(!passesFilters(row, { language: 'de' }));
});

test('search url caps limit', () => assert.match(itunesSearchUrl({ term: 'a b', limit: 999 }), /limit=200/));


test('emailsFromHtml finds mailto and text emails, drops junk', () => {
  const html = '<a href="mailto:Booking@Show.com?subject=hi">x</a><p>Write hello@show.com</p><img src="logo@2x.png"><script>var a="x@sentry.io"</script><p>noreply@show.com</p>';
  assert.deepEqual(emailsFromHtml(html).sort(), ['booking@show.com', 'hello@show.com']);
});

test('contactPageUrls skips hosting platforms', () => {
  assert.deepEqual(contactPageUrls('https://anchor.fm/show'), []);
  assert.equal(contactPageUrls('https://growthtalks.fm/ep')[1], 'https://growthtalks.fm/contact');
});
