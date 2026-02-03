import { withCircuitBreaker, withInflightLimiter, sleep } from "@/lib/traffic-control";
import { GridGenerator, Viewport } from "@/lib/grid-generator";

const GOOGLE_API_KEYS = (process.env.GOOGLE_API_KEYS || process.env.GOOGLE_MAPS_API_KEY || "").split(",").filter(Boolean);
const FETCH_TIMEOUT_MS = Number(process.env.GOOGLE_PLACES_FETCH_TIMEOUT_MS || 10000);
const MAX_CONCURRENCY = 100; // Increased for deep country-wide scans

export interface GatewayResponse {
    places: any[];
    nextPageToken?: string;
}

class GooglePlacesGateway {
    private static instance: GooglePlacesGateway;
    private currentKeyIndex = 0;

    private constructor() { }

    public static getInstance() {
        if (!GooglePlacesGateway.instance) {
            GooglePlacesGateway.instance = new GooglePlacesGateway();
        }
        return GooglePlacesGateway.instance;
    }

    private getNextApiKey(): string {
        if (GOOGLE_API_KEYS.length === 0) throw new Error("Google API Keys configuration is missing.");
        const key = GOOGLE_API_KEYS[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % GOOGLE_API_KEYS.length;
        return key;
    }

    private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }

    public async scanCity(query: string, viewport: Viewport, options: { gridSize?: number; maxPagesPerGrid?: number } = {}): Promise<any[]> {
        const gridPoints = options.gridSize
            ? GridGenerator.generateGrid(viewport, options.gridSize)
            : GridGenerator.generate3x3Grid(viewport);
        const MAX_PAGES_PER_GRID = options.maxPagesPerGrid || 3; // Fetch up to 60 results per grid cell

        // Execute parallel requests for each grid sector
        // Limit concurrency to avoid unexpected rate limits despite inflight limiter
        console.log(`[Grid Scan] Starting scan. Grid points: ${gridPoints.length}. Viewport:`, JSON.stringify(viewport));

        const results = await Promise.all(gridPoints.map(async (point, index) => {
            console.log(`[Grid Scan] Processing point ${index + 1}/${gridPoints.length}: ${point.lat},${point.lng}`);
            // We use locationBias to focus the search on this specific grid cell
            const locationBias = {
                circle: {
                    center: { latitude: point.lat, longitude: point.lng },
                    radius: point.radius
                }
            };

            let allGridPlaces: any[] = [];
            let nextPageToken: string | undefined = undefined;
            let pageCount = 0;

            try {
                do {
                    // Add delay if paginating to be nice to API
                    if (pageCount > 0) await sleep(2000);

                    const response: GatewayResponse = await this.searchText(query, {
                        locationBias,
                        pageToken: nextPageToken
                    });

                    if (response.places && response.places.length > 0) {
                        console.log(`[Grid Scan] Found ${response.places.length} places in sector ${point.lat},${point.lng}`);
                        allGridPlaces.push(...response.places);
                    } else {
                        console.log(`[Grid Scan] No places in sector ${point.lat},${point.lng}`);
                    }

                    nextPageToken = response.nextPageToken;
                    pageCount++;

                } while (nextPageToken && pageCount < MAX_PAGES_PER_GRID);

                return allGridPlaces;
            } catch (e) {
                console.error(`[Grid Scan] Failed for sector ${point.lat},${point.lng}:`, e);
                return [];
            }
        }));

        // Flatten results
        return results.flat();
    }

    public async searchText(query: string, options: { pageToken?: string; pageSize?: number; locationBias?: any } = {}): Promise<GatewayResponse> {
        const url = "https://places.googleapis.com/v1/places:searchText";
        const fieldMask = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.businessStatus,places.location,places.viewport,places.photos,nextPageToken";

        return withCircuitBreaker("google-places", { resetTimeoutSec: 60 }, async () => {
            return withInflightLimiter("google-places:inflight", MAX_CONCURRENCY, 30, async () => {
                let attempt = 0;
                const maxAttempts = 3;

                while (attempt < maxAttempts) {
                    const apiKey = this.getNextApiKey();
                    try {
                        const body: any = {
                            textQuery: query,
                            languageCode: "tr",
                            pageSize: options.pageSize || 20,
                            pageToken: options.pageToken,
                        };

                        if (options.locationBias) {
                            body.locationBias = options.locationBias;
                        }

                        const response = await this.fetchWithTimeout(
                            url,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-Goog-Api-Key": apiKey,
                                    "X-Goog-FieldMask": fieldMask,
                                },
                                body: JSON.stringify(body),
                            },
                            FETCH_TIMEOUT_MS
                        );

                        if (!response.ok) {
                            const errorText = await response.text();
                            const isRetryable = [429, 500, 502, 503, 504].includes(response.status);

                            if (isRetryable && attempt < maxAttempts - 1) {
                                const backoff = Math.min(1000 * 2 ** attempt, 4000);
                                await sleep(backoff);
                                attempt++;
                                continue;
                            }
                            throw new Error(`Google Places API Error: ${response.status} - ${errorText}`);
                        }

                        const data = await response.json();
                        return {
                            places: (data.places || []).map(this.transformPlace),
                            nextPageToken: data.nextPageToken
                        };
                    } catch (error: any) {
                        if (error.name === 'AbortError' && attempt < maxAttempts - 1) {
                            attempt++;
                            continue;
                        }
                        throw error;
                    }
                }
                throw new Error("Google Places API: Max retries exceeded.");
            });
        });
    }

    private transformPlace(place: any) {
        return {
            place_id: place.id,
            name: place.displayName?.text || "",
            rating: place.rating,
            user_ratings_total: place.userRatingCount,
            formatted_address: place.formattedAddress,
            formatted_phone_number: place.nationalPhoneNumber,
            website: place.websiteUri,
            business_status: place.businessStatus,
            location: place.location,
            viewport: place.viewport,
            photos: place.photos || [],
            opening_hours: {
                open_now: place.regularOpeningHours?.openNow
            }
        };
    }
}

export const googlePlacesGateway = GooglePlacesGateway.getInstance();
