
import puppeteer, { Browser, Page } from 'puppeteer';
import { validateEmails } from './email-validator';

export interface ScrapedData {
    emails: string[];
    emailScores?: { [email: string]: number }; // Email reliability scores
    phones: string[];
    socials: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        linkedin?: string;
        youtube?: string;
    };
    meta?: {
        url: string;
        status: number;
        contentLength: number;
        foundEmailsBeforeFilter: number;
        validatedEmails: number;
    };
}

const SOCIAL_PATTERNS = {
    facebook: /facebook\.com\/[a-zA-Z0-9\.]+/i,
    instagram: /instagram\.com\/[a-zA-Z0-9\._]+/i,
    twitter: /(twitter|x)\.com\/[a-zA-Z0-9_]+/i,
    linkedin: /linkedin\.com\/(in|company)\/[a-zA-Z0-9\-_%]+/i,
    youtube: /youtube\.com\/(channel|user|c)\/[a-zA-Z0-9\-_]+/i,
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Basic international phone regex (very permissive)
const PHONE_REGEX = /(\+?[0-9]{1,4}[\s-]?)?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2,4}/g;
const HEADER_FOOTER_SELECTOR = 'header, footer, #header, #footer, .header, .footer';
const HEADER_FOOTER_LINK_SELECTOR = 'header a, footer a, #header a, #footer a, .header a, .footer a';

const HUMAN_USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 }
];

const JUNK_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico', '.css', '.js', '.woff', '.woff2', '.mp4', '.mp3', '.wav', '.json', '.xml'];
const JUNK_DOMAINS = ['sentry.io', 'sentry.wixpress.com', 'sentry-next.wixpress.com', 'example.com', 'domain.com', 'email.com', 'yoursite.com'];
const JUNK_PREFIXES = ['u002f', 'u003e', 'ue00', 'name@'];

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const sleepRandom = async (minMs: number, maxMs: number) => {
    const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
    return new Promise((resolve) => setTimeout(resolve, delay));
};

const extractEmailsFromText = (text: string) => {
    const emailMatches = text.match(EMAIL_REGEX) || [];
    return [...new Set(emailMatches)]
        .map(e => e.toLowerCase())
        .filter(e => {
            if (JUNK_EXTENSIONS.some(ext => e.endsWith(ext))) return false;
            const domain = e.split('@')[1];
            if (!domain || JUNK_DOMAINS.some(d => domain.includes(d))) return false;
            if (JUNK_PREFIXES.some(p => e.startsWith(p))) return false;
            if (/^[0-9]+@/.test(e)) return false;
            return true;
        });
};

const extractPhonesFromText = (text: string) => {
    const phoneMatches = text.match(PHONE_REGEX) || [];
    return [...new Set(phoneMatches)]
        .map(p => p.trim())
        .filter(p => p.length >= 8 && p.length <= 20);
};

const parseMailto = (href: string) => {
    const raw = href.replace(/^mailto:/i, '').split('?')[0];
    try {
        return decodeURIComponent(raw).trim();
    } catch {
        return raw.trim();
    }
};

const parseTel = (href: string) => {
    const raw = href.replace(/^tel:/i, '').split('?')[0];
    try {
        return decodeURIComponent(raw).trim();
    } catch {
        return raw.trim();
    }
};

const applyHumanSignals = async (page: Page) => {
    await page.setUserAgent(pickRandom(HUMAN_USER_AGENTS));
    await page.setViewport(pickRandom(VIEWPORTS));
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    });
};

const performHumanInteraction = async (page: Page) => {
    await sleepRandom(150, 450);
    const { width, height } = page.viewport() || { width: 1366, height: 768 };
    try {
        await page.mouse.move(Math.floor(width * 0.2), Math.floor(height * 0.3), { steps: 8 });
        await page.mouse.move(Math.floor(width * 0.6), Math.floor(height * 0.4), { steps: 10 });
        await page.mouse.wheel({ deltaY: Math.floor(200 + Math.random() * 600) });
        await sleepRandom(200, 600);
    } catch {
        // Ignore if mouse/viewport not ready
    }
};

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
    let browser: Browser | null = null;
    const data: ScrapedData = {
        emails: [],
        phones: [],
        socials: {}
    };

    try {
        // Prepare URL
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        browser = await puppeteer.launch({
            headless: true, // "new" is deprecated, true is the standard now
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await applyHumanSignals(page);

        // Block resources to speed up
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate with timeout
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await performHumanInteraction(page);
        const httpStatus = response ? response.status() : 0;

        // Get full HTML content
        const content = await page.content();

        // 1. Extract Emails / Phones from full content
        const emailMatches = content.match(EMAIL_REGEX) || [];
        const foundEmailsBeforeFilter = emailMatches.length;
        data.emails = extractEmailsFromText(content);
        data.phones = extractPhonesFromText(content);

        // 3. Extract Social Links
        // Look at all 'a' tags hrefs
        const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: a.innerText })));
        const headerFooterText = await page.$$eval(
            HEADER_FOOTER_SELECTOR,
            els => els.map(el => (el as HTMLElement).innerText || '').join('\n')
        ).catch(() => "");
        const headerFooterLinks = await page.$$eval(
            HEADER_FOOTER_LINK_SELECTOR,
            as => as.map(a => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLAnchorElement).innerText }))
        ).catch(() => []);

        if (headerFooterText) {
            data.emails = [...new Set([...data.emails, ...extractEmailsFromText(headerFooterText)])];
            data.phones = [...new Set([...data.phones, ...extractPhonesFromText(headerFooterText)])];
        }

        const mailtoEmails = links
            .map(l => l.href)
            .filter(h => h.toLowerCase().startsWith('mailto:'))
            .map(parseMailto)
            .filter(Boolean);

        const telPhones = links
            .map(l => l.href)
            .filter(h => h.toLowerCase().startsWith('tel:'))
            .map(parseTel)
            .filter(Boolean);

        const headerMailtoEmails = (headerFooterLinks as any[])
            .map(l => l.href)
            .filter((h: string) => h.toLowerCase().startsWith('mailto:'))
            .map(parseMailto)
            .filter(Boolean);

        const headerTelPhones = (headerFooterLinks as any[])
            .map(l => l.href)
            .filter((h: string) => h.toLowerCase().startsWith('tel:'))
            .map(parseTel)
            .filter(Boolean);

        data.emails = [...new Set([...data.emails, ...mailtoEmails, ...headerMailtoEmails])];
        data.phones = [...new Set([...data.phones, ...telPhones, ...headerTelPhones])];

        links.forEach(link => {
            const href = link.href;
            if (SOCIAL_PATTERNS.facebook.test(href)) data.socials.facebook = href;
            if (SOCIAL_PATTERNS.instagram.test(href)) data.socials.instagram = href;
            if (SOCIAL_PATTERNS.twitter.test(href)) data.socials.twitter = href;
            if (SOCIAL_PATTERNS.linkedin.test(href)) data.socials.linkedin = href;
            if (SOCIAL_PATTERNS.youtube.test(href)) data.socials.youtube = href;
        });

        // --- SMART ENRICHMENT: Visit Contact Pages if no email found ---
        if (data.emails.length === 0) {
            console.log(`[Smart Scraper] No emails on homepage of ${url}. Looking for contact pages...`);

            const CONTACT_KEYWORDS = ['iletişim', 'contact', 'hakkımızda', 'about', 'bize ulaşın', 'künye'];

            // Find best candidate link
            // We look for links that contain keyword in text OR url, and belong to same domain
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            const contactLink = links.find(l => {
                const linkHref = l.href.toLowerCase();
                const linkText = l.text.toLowerCase();

                // Must be internal (relative or same domain)
                if (!linkHref.includes(domain) && linkHref.startsWith('http')) return false;

                return CONTACT_KEYWORDS.some(k => linkHref.includes(k) || linkText.includes(k));
            });

            if (contactLink) {
                console.log(`[Smart Scraper] Visiting potential contact page: ${contactLink.href}`);
                try {
                    await page.goto(contactLink.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const subContent = await page.content();

                    const newEmails = extractEmailsFromText(subContent);

                    if (newEmails.length > 0) {
                        console.log(`[Smart Scraper] Found ${newEmails.length} emails on sub-page!`);
                        data.emails = [...new Set([...data.emails, ...newEmails])];
                    }
                } catch (subError) {
                    console.error(`[Smart Scraper] Failed to visit sub-page:`, subError);
                }
            }
        }

        // --- EMAIL VALIDATION ---
        if (data.emails.length > 0) {
            console.log(`[Email Validator] Validating ${data.emails.length} emails for ${url}...`);

            try {
                const validationResults = await validateEmails(data.emails, url, 40);

                // Build score map
                const emailScores: { [email: string]: number } = {};
                validationResults.forEach(result => {
                    emailScores[result.email] = result.score;
                });

                // Keep only validated emails (sorted by score)
                data.emails = validationResults.map(r => r.email);
                data.emailScores = emailScores;

                console.log(`[Email Validator] ${validationResults.length}/${data.emails.length} emails passed validation`);
            } catch (validationError) {
                console.error(`[Email Validator] Validation error:`, validationError);
                // Keep original emails on validation failure
            }
        }

        data.meta = {
            url,
            status: httpStatus,
            contentLength: content.length,
            foundEmailsBeforeFilter,
            validatedEmails: data.emails.length
        };

        return data;

    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return data; // Return empty/partial results on error
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

const decodeDuckDuckGoUrl = (href: string | null) => {
    if (!href) return null;
    try {
        const url = new URL(href);
        if (url.hostname.includes('duckduckgo.com')) {
            const uddg = url.searchParams.get('uddg');
            if (uddg) return decodeURIComponent(uddg);
        }
    } catch {
        // ignore
    }
    return href;
};

const isLikelyWebsiteUrl = (href: string) => {
    const lower = href.toLowerCase();
    const blocked = [
        'facebook.com',
        'instagram.com',
        'twitter.com',
        'x.com',
        'linkedin.com',
        'youtube.com',
        'tiktok.com',
        'google.com/maps',
        'goo.gl/maps',
        'g.page',
        'yelp.com',
        'tripadvisor.',
        'opentable.com',
        'foursquare.com',
        'apple.com/maps'
    ];
    if (blocked.some(b => lower.includes(b))) return false;
    return lower.startsWith('http');
};

const mergeSocials = (a: ScrapedData["socials"], b: ScrapedData["socials"]) => ({
    facebook: b.facebook || a.facebook,
    instagram: b.instagram || a.instagram,
    twitter: b.twitter || a.twitter,
    linkedin: b.linkedin || a.linkedin,
    youtube: b.youtube || a.youtube
});

export async function searchDuckDuckGoTargets(query: string): Promise<{ website: string | null; socials: ScrapedData["socials"] }> {
    let browser: Browser | null = null;
    try {
        console.log(`[Web Search] Searching for: "${query}" via DuckDuckGo`);
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await applyHumanSignals(page);

        // Block heavy resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'media', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Use HTML version of DDG
        await page.goto('https://html.duckduckgo.com/html/', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Type into the form
        await sleepRandom(200, 500);
        await page.type('input[name="q"]', query, { delay: Math.floor(30 + Math.random() * 60) });
        await page.keyboard.press('Enter');

        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await performHumanInteraction(page);

        // Extract organic results
        const hrefs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.result__a'))
                .map(a => (a as HTMLAnchorElement).getAttribute('href'))
                .filter(Boolean);
        });

        let website: string | null = null;
        let socials: ScrapedData["socials"] = {};

        for (const rawHref of hrefs) {
            const decoded = decodeDuckDuckGoUrl(rawHref);
            if (!decoded) continue;

            if (SOCIAL_PATTERNS.facebook.test(decoded)) socials = mergeSocials(socials, { facebook: decoded });
            if (SOCIAL_PATTERNS.instagram.test(decoded)) socials = mergeSocials(socials, { instagram: decoded });
            if (SOCIAL_PATTERNS.twitter.test(decoded)) socials = mergeSocials(socials, { twitter: decoded });
            if (SOCIAL_PATTERNS.linkedin.test(decoded)) socials = mergeSocials(socials, { linkedin: decoded });
            if (SOCIAL_PATTERNS.youtube.test(decoded)) socials = mergeSocials(socials, { youtube: decoded });

            if (!website && isLikelyWebsiteUrl(decoded)) {
                website = decoded;
            }
        }

        console.log(`[Web Search] Found Website: ${website}`);
        return { website, socials };

    } catch (error) {
        console.error(`[Web Search] Failed for query "${query}":`, error);
        return { website: null, socials: {} };
    } finally {
        if (browser) await browser.close();
    }
}

export async function searchGoogle(query: string): Promise<string | null> {
    const result = await searchDuckDuckGoTargets(query);
    return result.website;
}
