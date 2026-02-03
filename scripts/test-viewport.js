const { googlePlacesGateway } = require('./src/lib/gateway/google-places');
require('dotenv').config();

async function testViewport() {
    console.log("Fetching viewport for 'italy'...");
    try {
        const result = await googlePlacesGateway.searchText("italy", { pageSize: 1 });
        const place = result.places[0];
        console.log("Place found:", place.name);
        console.log("Full place object (limited):", JSON.stringify({
            name: place.name,
            location: place.location,
            viewport: place.viewport // Wait, is viewport in the transformed object?
        }, null, 2));

        // Check if transformPlace includes viewport
        // (I saw the code earlier, it DOES NOT seem to include viewport in transformPlace)
        // Wait, let me re-read transformPlace in google-places.ts
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testViewport();
