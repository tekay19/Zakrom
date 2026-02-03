
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queue/config';
import { prisma } from '@/lib/prisma';
import { scrapeWebsite } from '@/lib/scraper';

const QUEUE_NAME = 'enrichment-jobs';

export const setupEnrichmentWorker = () => {
    console.log('🕵️ Enrichment Worker starting...');

    const worker = new Worker(
        QUEUE_NAME,
        async (job: Job) => {
            const { placeId, website } = job.data;
            console.log(`[Enrichment ${job.id}] Scraping ${website} for Place ${placeId}`);

            try {
                // 1. Update status
                const existingPlace = await prisma.place.update({
                    where: { id: placeId },
                    data: { scrapeStatus: 'PROCESSING' },
                    select: {
                        googleId: true,
                        name: true,
                        address: true,
                        website: true,
                        emails: true,
                        emailScores: true,
                        phones: true,
                        socials: true
                    }
                });

                // 2. Perform Scraping
                // 2. Perform Scraping

                let targetWebsite = website || existingPlace.website || "";
                let usedFallback = false;
                let foundSocials: any = {};

                // Fallback: If no website provided OR socials missing, search DuckDuckGo
                const existingSocials = (existingPlace.socials as any) || {};
                const socialsMissing = !existingSocials || Object.keys(existingSocials).length === 0;

                if (!targetWebsite || socialsMissing) {
                    const { name, address } = job.data;
                    console.log(`[Enrichment ${job.id}] Looking up website/socials on DuckDuckGo for "${name} ${address}"...`);

                    // Import dynamically to avoid circular deps if any (though here it's fine)
                    const { searchDuckDuckGoTargets } = await import('@/lib/scraper');
                    const ddgResult = await searchDuckDuckGoTargets(`${name} ${address}`);
                    const foundUrl = ddgResult.website;
                    foundSocials = ddgResult.socials || {};

                    if (foundUrl) {
                        if (!targetWebsite) {
                            targetWebsite = foundUrl;
                            usedFallback = true;
                        }
                        // Determine if we should save this URL to DB immediately?
                        // We will save it at the end ensuring we don't overwrite if it's bad?
                        // Actually, if we scraped it successfully, it's likely good.
                    } else {
                        console.log(`[Enrichment ${job.id}] No website found on DuckDuckGo.`);
                    }
                }

                if (!targetWebsite) {
                    // Nothing to scrape
                    console.log(`[Enrichment ${job.id}] No website to scrape. Finishing.`);
                    await prisma.place.update({
                        where: { id: placeId },
                        data: { scrapeStatus: 'COMPLETED' } // Completed with no extra data
                    });
                    return;
                }

                const data = await scrapeWebsite(targetWebsite);
                const mergedSocials = {
                    ...(existingSocials || {}),
                    ...(foundSocials || {}),
                    ...(data.socials || {})
                };
                const mergedEmails = (data.emails && data.emails.length > 0) ? data.emails : (existingPlace.emails || []);
                const mergedPhones = (data.phones && data.phones.length > 0) ? data.phones : (existingPlace.phones || []);
                const mergedEmailScores = (data.emailScores && Object.keys(data.emailScores).length > 0)
                    ? data.emailScores
                    : (existingPlace.emailScores as any) || {};
                const finalWebsite = (existingPlace.website || "").trim() || targetWebsite || "";

                if (data.meta) {
                    console.log(`[Enrichment ${job.id}] Scraper Meta: Status=${data.meta.status}, Len=${data.meta.contentLength}, PreFilter=${data.meta.foundEmailsBeforeFilter}`);
                }

                if (data.emails.length === 0) {
                    console.warn(`[Enrichment ${job.id}] ⚠️ No emails found for ${targetWebsite}`);
                }

                console.log(`[Enrichment ${job.id}] Final: ${mergedEmails.length} emails, ${Object.keys(mergedSocials).length} socials`);

                // 3. Save Data
                const updatedPlace = await prisma.place.update({
                    where: { id: placeId },
                    data: {
                        emails: mergedEmails,
                        emailScores: mergedEmailScores,
                        phones: mergedPhones,
                        socials: mergedSocials as any,
                        scrapeStatus: 'COMPLETED',
                        // If we found a website via fallback, save it!
                        ...(usedFallback && targetWebsite ? { website: targetWebsite } : (finalWebsite ? { website: finalWebsite } : {}))
                    }
                });

                // 4. Publish Real-Time Update if Job ID exists
                if (job.data.jobId) {
                    const redis = await import('@/lib/redis').then(m => m.redis);
                    const updatePayload = [{
                        place_id: updatedPlace.googleId,
                        name: updatedPlace.name,
                        // We must send ALL fields needed by frontend to merging logic
                        emails: updatedPlace.emails,
                        emailScores: updatedPlace.emailScores,
                        phones: updatedPlace.phones,
                        socials: updatedPlace.socials,
                        website: updatedPlace.website,
                        formatted_address: updatedPlace.address, // Maintain context
                        // Add marker to tell frontend this is an UPDATE not a new row?
                        // The frontend helper: "const uniqueNew = newPlaces.filter(...)".
                        // If we re-send the same ID, frontend logic:
                        // "const uniqueNew = newPlaces.filter((p: any) => !existingIds.has(p.place_id));"
                        // !!! PROBLEM: Frontend ignores it if ID exists!
                        // We need frontend to UPDATE existing ID.
                    }];

                    // Frontend Logic Re-Check required:
                    // Frontend currently does:
                    // setResults((prev) => {
                    //    const existingIds = new Set(prev.map((p) => p.place_id));
                    //    const uniqueNew = newPlaces.filter((p: any) => !existingIds.has(p.place_id));
                    //    return [...prev, ...uniqueNew];
                    // });

                    // Using a different event channel or logic? 'search:enrichment:${jobId}'?
                    // Or modifying frontend to MERGE?
                    // Let's modify frontend to merge updates for existing IDs.

                    await redis.publish(`search:updates:${job.data.jobId}`, JSON.stringify(updatePayload));
                }

            }
            catch (error: any) {
                console.error(`[Enrichment ${job.id}] Failed:`, error.message);
                await prisma.place.update({
                    where: { id: placeId },
                    data: { scrapeStatus: 'FAILED' }
                });
                throw error;
            }
        },
        {
            connection: redisConnection,
            concurrency: parseInt(process.env.ENRICHMENT_CONCURRENCY || '10') // Increased for speed
        }
    );

    worker.on('failed', (job, err) => {
        console.error(`[Enrichment Job ${job?.id}] Failed completely:`, err.message);
    });

    return worker;
};

// Global singleton
// Global singleton handling for Hot Module Replacement (HMR)
const globalForEnrichmentWorker = global as unknown as { enrichmentWorker: Worker | undefined };

if (process.env.NODE_ENV !== 'production' && globalForEnrichmentWorker.enrichmentWorker) {
    console.log('🔄 Reloading Enrichment Worker (Closing old instance)...');
    globalForEnrichmentWorker.enrichmentWorker.close();
    globalForEnrichmentWorker.enrichmentWorker = undefined;
}

if (!globalForEnrichmentWorker.enrichmentWorker && process.env.NODE_ENV !== 'test') {
    globalForEnrichmentWorker.enrichmentWorker = setupEnrichmentWorker();
}
