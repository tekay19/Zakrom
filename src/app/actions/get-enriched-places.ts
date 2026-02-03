"use server";

import { prisma } from "@/lib/prisma";

export async function getEnrichedPlaces(placeIds: string[]) {
    if (!placeIds || placeIds.length === 0) {
        return [];
    }

    // Limit to prevent abuse
    const limitedIds = placeIds.slice(0, 200);

    const places = await prisma.place.findMany({
        where: {
            googleId: { in: limitedIds }
        },
        select: {
            googleId: true,
            emails: true,
            emailScores: true,
            phones: true,
            socials: true,
            website: true,
            scrapeStatus: true
        }
    });

    return places.map(p => ({
        place_id: p.googleId,
        emails: p.emails || [],
        emailScores: p.emailScores || {},
        phones: p.phones || [],
        socials: p.socials || {},
        website: p.website,
        scrapeStatus: p.scrapeStatus
    }));
}
