const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const italyGyms = await prisma.place.count({
        where: {
            AND: [
                {
                    OR: [
                        { name: { contains: 'gym', mode: 'insensitive' } },
                        { name: { contains: 'fitness', mode: 'insensitive' } },
                        { name: { contains: 'sport', mode: 'insensitive' } },
                        { name: { contains: 'palestra', mode: 'insensitive' } }, // Italian for gym
                        { address: { contains: 'gym', mode: 'insensitive' } },
                        { address: { contains: 'fitness', mode: 'insensitive' } }
                    ]
                },
                {
                    OR: [
                        { address: { contains: 'İtalya', mode: 'insensitive' } },
                        { address: { contains: 'Italy', mode: 'insensitive' } },
                        { address: { contains: 'Roma', mode: 'insensitive' } },
                        { address: { contains: 'Milano', mode: 'insensitive' } }
                    ]
                }
            ]
        }
    });

    console.log(`\n--- Broad Search Results ---`);
    console.log(`Estimated gyms found in Italy: ${italyGyms}`);

    // Last 5 to verify
    const samples = await prisma.place.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { name: { contains: 'gym', mode: 'insensitive' } },
                        { name: { contains: 'fitness', mode: 'insensitive' } },
                        { name: { contains: 'sport', mode: 'insensitive' } },
                        { name: { contains: 'palestra', mode: 'insensitive' } }
                    ]
                },
                {
                    OR: [
                        { address: { contains: 'İtalya', mode: 'insensitive' } },
                        { address: { contains: 'Italy', mode: 'insensitive' } }
                    ]
                }
            ]
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
    });

    console.log('\n--- Sample Records ---');
    samples.forEach(s => console.log(`- ${s.name} (${s.address})`));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
