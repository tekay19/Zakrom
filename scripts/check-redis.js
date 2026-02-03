const Redis = require('ioredis');
const redis = new Redis("redis://localhost:6379");

async function main() {
    const city = 'italy';
    const keyword = 'gym';
    const listDataCacheKey = `search:list:data:${city}:${keyword}`;
    const listCacheKey = `search:list:${city}:${keyword}`;

    const [allPlacesParam, allIdsParam] = await Promise.all([
        redis.get(listDataCacheKey),
        redis.get(listCacheKey),
    ]);

    console.log(`\n--- Redis Check (italy:gym) ---`);
    if (allPlacesParam) {
        const parsed = JSON.parse(allPlacesParam);
        const allPlaces = Array.isArray(parsed) ? parsed : (parsed?.places || []);
        console.log(`Total places in Redis 'data' list: ${allPlaces.length}`);
    } else {
        console.log(`No 'data' cache found.`);
    }

    if (allIdsParam) {
        const allIds = JSON.parse(allIdsParam);
        console.log(`Total place IDs in Redis 'id' list: ${allIds.length}`);
    } else {
        console.log(`No 'id' cache found.`);
    }

    redis.disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
