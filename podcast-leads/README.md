# Podcast Leads Finder: host emails, activity and guest score

Find **active podcasts that take guests** in any niche. You get the **owner's contact email**, website, social links and how often each show publishes, all in one table ready for outreach.

Built for:
- **Podcast guesting**: pitch yourself or your clients as a guest.
- **Sponsorship and ad sales**: find shows in your niche that are still publishing.
- **PR agencies and podcast booking services**: build prospect lists in minutes.

## Why this one

| | Podcast Leads Finder | Typical alternatives |
|---|---|---|
| Price per podcast with email | **$0.008** | $0.05 or more on the Store; $49–$400/mo for SaaS tools |
| Skips dead shows | Yes (`onlyActive`, `activeDays`) | Often no |
| Guest-interview score | Yes | Rarely |
| Opt-out list | Yes | Rarely |

You only pay for podcasts that pass your filters, and `maxResults` puts a hard cap on cost.

## What you get (one row per show)

`title`, `author`, `ownerName`, `ownerEmail`, `contactEmails`, `website`, `socialLinks`, `primaryGenre`, `genres`, `language`, `country`, `episodeCount`, `lastEpisodeDate`, `avgDaysBetweenEpisodes`, `isActive`, `guestInterviewScore` (0–1, the share of recent episode titles that look like interviews), `appleUrl`, `feedUrl`, `artworkUrl`, `explicit`, `searchKeyword`.

```json
{
  "title": "Growth Talks",
  "ownerName": "Jane Host",
  "ownerEmail": "jane@growthtalks.fm",
  "website": "https://growthtalks.fm",
  "episodeCount": 212,
  "lastEpisodeDate": "2026-10-05T10:00:00.000Z",
  "avgDaysBetweenEpisodes": 7,
  "isActive": true,
  "guestInterviewScore": 0.67
}
```

## How to use

1. Enter one or more **keywords** (e.g. `saas marketing`, `real estate investing`).
2. Keep **Only active shows** and **Only shows with a contact email** on for outreach lists.
3. Run it, then export to CSV, Excel or JSON, or connect it to Google Sheets, Zapier or Make.

## Pricing (pay per event)

- **Podcast with contact email:** $0.008
- **Podcast without email** (only when you turn off "Only shows with a contact email"): $0.002

1,000 qualified leads cost about **$8**.

## Data sources and responsible use

Data comes from the public Apple Podcasts search API and each show's own public RSS feed, where publishers list a contact email for directory use. This Actor is not affiliated with or endorsed by Apple.

Contact emails can be personal data under GDPR and similar laws. Use them only for relevant, individual business outreach, honor opt-outs (add them to `excludeEmails`), and follow the anti-spam laws that apply to you.

## Support

Open an issue on the Actor's **Issues** tab and it will usually be fixed within a few days.
