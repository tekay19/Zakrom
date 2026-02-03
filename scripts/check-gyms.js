const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const history = await prisma.searchHistory.findMany({
        where: {
            OR: [
                { city: { contains: 'Italy', mode: 'insensitive' } },
                { keyword: { contains: 'gym', mode: 'insensitive' } }
            ]
        },
        orderBy: { createdAt: 'desc' }
    });

    console.log('--- Search History ---');
    history.forEach(h => {
        console.log(`[${h.createdAt}] Keyword: ${h.keyword}, City: ${h.city}, Count: ${h.resultCount}`);
    });

    const gymCount = await prisma.place.count({
        where: {
            AND: [
                { types: { hasSome: ['gym', 'fitness_center', 'health_club'] } },
                { address: { contains: 'Italy', mode: 'insensitive' } }
            ]
        }
    });

    console.log('\n--- Place Table Stats ---');
    console.log(`Total gyms found in Italy (Place table): ${gymCount}`);

    // Also check general "gym" keyword searches if no "Italy" found specifically in city
    const totalGyms = await prisma.place.count({
        where: {
            types: { hasSome: ['gym', 'fitness_center', 'health_club'] }
        }
    });
    console.log(`Total gyms found globally (Place table): ${totalGyms}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
