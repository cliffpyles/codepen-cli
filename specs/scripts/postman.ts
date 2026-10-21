/** Writes dist/codepen-api-v2.postman_collection.json, for importing into Postman. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCollection } from '../lib/postman.js';
import { loadSpec } from '../lib/spec.js';

const out = new URL('../dist/codepen-api-v2.postman_collection.json', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, `${JSON.stringify(await buildCollection(loadSpec()), null, 2)}\n`);
console.log('Wrote dist/codepen-api-v2.postman_collection.json');
