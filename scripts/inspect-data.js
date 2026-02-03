const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const lastPlaces = await prisma.place.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    console.log('--- Last 10 Places ---');
    lastPlaces.forEach(p => {
        console.log(`Name: ${p.name}, Address: ${p.address}, Types: ${p.types}`);
    });

    const totalPlaces = await prisma.place.count();
    console.log(`\nTotal Places in DB: ${totalPlaces}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
