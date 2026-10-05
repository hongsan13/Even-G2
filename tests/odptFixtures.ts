// Synthetic records shaped like the published ODPT schema; no operator timetable is bundled.
export const railway = 'odpt.Railway:JR-East.Test';
export const stationA = 'odpt.Station:JR-East.Test.A', stationB = 'odpt.Station:JR-East.Test.B';
export const railways = [{ 'owl:sameAs': railway, 'dc:title': '架空試験線', 'odpt:ascendingRailDirection': 'odpt.RailDirection:Up' }];
export const stations = [stationA, stationB].map((id, i) => ({ 'owl:sameAs': id, 'odpt:stationTitle': { ja: `架空駅${i ? 'B' : 'A'}` } }));
export const trains = [{ 'owl:sameAs': 'odpt.TrainTimetable:JR-East.Test.T1.Weekday', 'odpt:railway': railway, 'odpt:calendar': 'odpt.Calendar:Weekday',
  'odpt:trainTimetableObject': [{ 'odpt:departureStation': stationA, 'odpt:departureTime': '23:59' }, { 'odpt:arrivalStation': stationB, 'odpt:arrivalTime': '24:05' }] }];
export const meta = { title: '架空JSON試験', source: 'Synthetic fixture', license: 'CC0 test', start: '20261001', end: '20261031', holidays: ['20261012'] };
