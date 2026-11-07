export interface DispatchConfig {
  offerTtlMs: number;
  maxAttempts: number;
  maxActiveJobs: number;
  candidateLimit: number;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  offerTtlMs: 2 * 60 * 1000,
  maxAttempts: 3,
  maxActiveJobs: 5,
  candidateLimit: 50,
};

export interface RankableCandidate {
  userId: string;
  activeJobCount: number;
  latitude: string | null;
  longitude: string | null;
}

export interface RankedCandidate<T extends RankableCandidate> {
  candidate: T;
  score: number;
  distanceKm: number | null;
}

export interface DispatchLocation {
  latitude: string | null;
  longitude: string | null;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  from: DispatchLocation,
  to: DispatchLocation,
): number | null {
  if (from.latitude === null || from.longitude === null) return null;
  if (to.latitude === null || to.longitude === null) return null;

  const fromLat = Number(from.latitude);
  const fromLon = Number(from.longitude);
  const toLat = Number(to.latitude);
  const toLon = Number(to.longitude);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return null;

  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankCandidates<T extends RankableCandidate>(
  candidates: T[],
  bookingLocation: DispatchLocation,
): RankedCandidate<T>[] {
  return candidates
    .map((candidate) => {
      const distanceKm = haversineKm(
        { latitude: candidate.latitude, longitude: candidate.longitude },
        bookingLocation,
      );
      // Workload dominates; distance breaks ties. A neutral 25 km is used when
      // either side has no coordinates, rather than inventing a precise distance.
      const score = candidate.activeJobCount * 10 + (distanceKm ?? 25);
      return { candidate, score, distanceKm };
    })
    .sort((a, b) => a.score - b.score || a.candidate.userId.localeCompare(b.candidate.userId));
}