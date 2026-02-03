import { Worker, Job } from "bullmq";
import { redisConnection } from "../queue/config";
import ExcelJS from "exceljs";
import { redis } from "../redis";
import { prisma } from "@/lib/prisma";

const EXPORT_QUEUE_NAME = "export-jobs";

const worker = new Worker(EXPORT_QUEUE_NAME, async (job: Job) => {
    const { results, format, userId, jobId } = job.data;

    console.log(`Processing export for user ${userId}, job ${job.id}`);

    await redis.set(`export:${jobId}:status`, "processing", "EX", 3600);
    await redis.set(`export:${jobId}:format`, format, "EX", 3600);

    try {
        // Fetch Fresh Data from DB to ensure Emails/Phones are up to date
        // (Frontend might be stale due to socket issues)
        const placeIds = results.map((r: any) => r.place_id).filter(Boolean);
        const freshPlaces = await prisma.place.findMany({
            where: { googleId: { in: placeIds } },
            select: {
                googleId: true,
                emails: true,
                phones: true,
                socials: true,
                website: true
            }
        });

        const freshMap = new Map(freshPlaces.map(p => [p.googleId, p]));

        if (format === "xlsx") {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Arama Sonuçları");

            sheet.columns = [
                { header: "İşletme Adı", key: "name", width: 30 },
                { header: "Adres", key: "address", width: 50 },
                { header: "Telefon", key: "phone", width: 20 },
                { header: "Web Sitesi", key: "website", width: 30 },
                { header: "E-postalar", key: "emails", width: 40 },
                { header: "Bulunan Telefonlar", key: "scraped_phones", width: 30 },
                { header: "Instagram", key: "instagram", width: 30 },
                { header: "Facebook", key: "facebook", width: 30 },
                { header: "LinkedIn", key: "linkedin", width: 30 },
                { header: "Puan", key: "rating", width: 10 },
                { header: "Yorum Sayısı", key: "reviews", width: 15 },
                { header: "Kategori", key: "category", width: 20 },
            ];

            results.forEach((place: any) => {
                const fresh = freshMap.get(place.place_id);

                // Merge logic: Use Fresh DB data if available, otherwise fallback to frontend data
                const finalEmails = (fresh?.emails && fresh.emails.length > 0) ? fresh.emails : (place.emails || []);
                const finalPhones = (fresh?.phones && fresh.phones.length > 0) ? fresh.phones : (place.phones || []); // Scraped phones
                const finalSocials = fresh?.socials ? (fresh.socials as any) : (place.socials || {});
                const finalWebsite = fresh?.website || place.website || place.websiteUri;

                const emailsStr = Array.isArray(finalEmails) ? finalEmails.join(", ") : "";

                sheet.addRow({
                    name: place.name,
                    address: place.formatted_address || place.formattedAddress,
                    phone: place.formatted_phone_number || place.nationalPhoneNumber || "-",
                    website: finalWebsite || "-",
                    emails: emailsStr || "-",
                    scraped_phones: finalPhones.join(", ") || "-",
                    instagram: finalSocials.instagram || "-",
                    facebook: finalSocials.facebook || "-",
                    linkedin: finalSocials.linkedin || "-",
                    rating: place.rating || "-",
                    reviews: place.user_ratings_total || place.userRatingCount || 0,
                    category: place.types?.[0] || place.primaryTypeDisplayName?.text || "-",
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            // Store buffer in Redis temporarily (or S3 in production)
            const base64 = (buffer as any).toString("base64");
            await redis.set(`export:${jobId}:result`, base64, "EX", 3600);
            await redis.set(`export:${jobId}:status`, "completed", "EX", 3600);
        } else {
            // CSV Logic simplified
            const header = "İşletme Adı,Adres,Telefon,Web Sitesi,E-postalar,Bulunan Telefonlar,Instagram,Facebook,LinkedIn,Puan,Yorum Sayısı,Kategori\n";
            const rows = results.map((p: any) => {
                const fresh = freshMap.get(p.place_id);
                // Merge logic for CSV
                const finalEmails = (fresh?.emails && fresh.emails.length > 0) ? fresh.emails : (p.emails || []);
                const finalPhones = (fresh?.phones && fresh.phones.length > 0) ? fresh.phones : (p.phones || []);
                const finalSocials = fresh?.socials ? (fresh.socials as any) : (p.socials || {});
                const finalWebsite = fresh?.website || p.website || p.websiteUri;

                const emails = finalEmails.join("; ");
                const phones = finalPhones.join("; ");
                const socialInsta = finalSocials.instagram || "";
                const socialFb = finalSocials.facebook || "";
                const socialLi = finalSocials.linkedin || "";

                return `"${p.name}","${p.formatted_address || p.formattedAddress || "-"}","${p.formatted_phone_number || p.nationalPhoneNumber || "-"}","${finalWebsite || "-"}","${emails}","${phones}","${socialInsta}","${socialFb}","${socialLi}","${p.rating || "-"}","${p.user_ratings_total || p.userRatingCount || 0}","${p.types?.[0] || p.primaryTypeDisplayName?.text || "-"}"`;
            }).join("\n");

            await redis.set(`export:${jobId}:result`, header + rows, "EX", 3600);
            await redis.set(`export:${jobId}:status`, "completed", "EX", 3600);
        }
    } catch (err: any) {
        console.error("Export failed", err);
        await redis.set(`export:${jobId}:status`, "failed", "EX", 3600);
        await redis.set(`export:${jobId}:error`, err.message, "EX", 3600);
    }
}, { connection: redisConnection });

export default worker;
