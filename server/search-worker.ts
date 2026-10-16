import { parentPort, workerData } from 'node:worker_threads';
import { findJourneys } from '../src/transit/routing';
import { selectNextDepartures, recommendedDeparture, pastDepartures } from '../src/transit/departureSelector';
try {
  const { data, favorite, now } = workerData;
  const all = findJourneys(data, favorite, now, [], 60);
  const future = selectNextDepartures(all, now, favorite.walkingMinutes, favorite.bufferMinutes);
  const recommended = recommendedDeparture(future);
  const chosen = [...(recommended ? [recommended] : []), ...future.filter(d => d.reachable).slice(0, 3), ...pastDepartures(all, now).slice(-3)];
  parentPort!.postMessage({ journeys: [...new Map(chosen.map(d => [d.journey.id, d.journey])).values()] });
} catch { parentPort!.postMessage({ error: true }); }
