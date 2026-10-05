import { readFile, writeFile } from 'node:fs/promises';
const notices = [
  ['Even Hub SDK', 'node_modules/@evenrealities/even_hub_sdk/LICENSE'],
  ['Even Hub official template', 'docs/EVEN-TEMPLATE-LICENSE'],
  ['fflate', 'node_modules/fflate/LICENSE'],
  ['protobuf.js', 'node_modules/protobufjs/LICENSE'],
  ['Long.js (protobuf dependency)', 'node_modules/long/LICENSE'],
  ['GTFS-Realtime official schema (google/transit)', 'docs/GTFS-LICENSE'],
];
const content = await Promise.all(notices.map(async ([name, path]) => `${name}\n\n${await readFile(path, 'utf8')}`));
await writeFile('dist/THIRD-PARTY-NOTICES.txt', content.join('\n\n--------------------------------\n\n'));
