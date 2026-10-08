export interface LatLng {
  lat: number;
  lng: number;
}

/** 6 decimals ≈ 11 cm, matching the Decimal(9,6) database columns. */
export const round = (n: number) => Math.round(n * 1e6) / 1e6;
