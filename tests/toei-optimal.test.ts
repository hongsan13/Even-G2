import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGtfsZip } from '../src/transit/gtfs/parser';
import { findJourneys } from '../src/transit/routing';
import { selectNextDepartures, recommendedDeparture } from '../src/transit/departureSelector';
import { favorite, time } from './fixtures';
it('都営実データ：飯田橋→練馬春日町は直通より都庁前乗換の到着を優先', () => {
  const d=parseGtfsZip(readFileSync('public/feeds/toei-20260921.zip'),{title:'都営実データ',source:'東京都交通局',license:'CC BY 4.0'});
  const now=time('13:43','20261016');
  const f=favorite({from:'407',to:'438',walkingMinutes:0,bufferMinutes:0,transferMinutes:4,maxTransfers:2});
  const start=performance.now();
  const best=recommendedDeparture(selectNextDepartures(findJourneys(d,f,now),now,0,0))!;
  const direct=recommendedDeparture(selectNextDepartures(findJourneys(d,{...f,maxTransfers:0},now),now,0,0))!;
  if (process.env.TRANSIT_RECORD_ROUTING_EVIDENCE === 'true') writeFileSync('/tmp/transit-toei-optimal.json', JSON.stringify({ms:Math.round(performance.now()-start),best:best?.journey.legs.map(l=>({from:l.from,to:l.to,departure:l.departure,arrival:l.arrival})),direct:direct?.journey.arrival}));
  expect(best.journey.arrival).toBeLessThan(direct.journey.arrival);
  expect(best.journey.transfers).toBe(1);expect(best.journey.legs[0].to).toBe('429');
  expect(best.journey.legs[1].departure-best.journey.legs[0].arrival).toBeGreaterThanOrEqual(4*60000);
},20000);
