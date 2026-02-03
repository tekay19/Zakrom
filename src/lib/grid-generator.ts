
export interface Viewport {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
}

export interface GridPoint {
    lat: number;
    lng: number;
    radius: number; // approximate radius in meters to cover the sub-grid
}

export class GridGenerator {
    /**
     * Divides a viewport into a 3x3 grid (9 sectors) and returns the center point of each sector.
     * @param viewport The bounding box of the city
     * @returns Array of 9 Lat/Lng points representing the center of each grid cell.
     */
    static generate3x3Grid(viewport: Viewport): GridPoint[] {
        return this.generateGrid(viewport, 3);
    }

    /**
     * Divides a viewport into an NxN grid and returns the center point of each sector.
     * @param viewport The bounding box of the city
     * @param gridSize Number of cells per side (N)
     */
    static generateGrid(viewport: Viewport, gridSize: number): GridPoint[] {
        const size = Math.max(1, Math.min(20, Math.floor(gridSize)));
        const latSpan = viewport.northeast.lat - viewport.southwest.lat;
        const lngSpan = viewport.northeast.lng - viewport.southwest.lng;

        const cellLatSize = latSpan / size;
        const cellLngSize = lngSpan / size;

        const points: GridPoint[] = [];

        // Approximate radius for "Location Bias" (circle) to cover the rectangular cell
        // A diagonal of the cell / 2 is a safe radius.
        const radiusMeters = this.calculateRadius(cellLatSize, cellLngSize, viewport.southwest.lat);

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                // Row 0 is bottom (south), Row N-1 is top (north)
                // Col 0 is left (west), Col N-1 is right (east)
                const centerLat = viewport.southwest.lat + (row * cellLatSize) + (cellLatSize / 2);
                const centerLng = viewport.southwest.lng + (col * cellLngSize) + (cellLngSize / 2);

                points.push({
                    lat: centerLat,
                    lng: centerLng,
                    radius: radiusMeters
                });
            }
        }

        return points;
    }

    private static calculateRadius(latSize: number, lngSize: number, baseLat: number): number {
        // Haversine-ish approximation or simple conversion
        // 1 deg lat = 111,000 meters
        const heightMeters = latSize * 111000;

        // 1 deg lng = 111,000 * cos(lat) meters
        const widthMeters = lngSize * 111000 * Math.cos(baseLat * (Math.PI / 180));

        // Diagonal
        const diagonal = Math.sqrt((heightMeters * heightMeters) + (widthMeters * widthMeters));

        // Radius is half diagonal, plus a bit of overlap (10%)
        // Cap at 50000 meters (Google Places API limit)
        const MAX_RADIUS = 50000;
        return Math.min(MAX_RADIUS, Math.ceil((diagonal / 2) * 1.1));
    }
}
