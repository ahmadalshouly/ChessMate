import { openDb } from '../client';

const h = openDb();
await h.migrate();
console.log(`Migrations applied (${h.kind}: ${h.location})`);
await h.close();
