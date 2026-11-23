// Drives the practice board in Expo Go on the booted iOS Simulator with Maestro and checks
// tap-to-move and drag-and-drop by reading the accessibility tree. Prints PASS/FAIL lines.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '.';
const udid = process.env.UDID;
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flow = (name, steps) => {
  const file = `${out}/${name}.yaml`;
  writeFileSync(file, `appId: host.exp.Exponent\n---\n${steps}\n`);
  return sh('maestro', ['--device', udid, 'test', file]);
};
const shot = (name) => sh('xcrun', ['simctl', 'io', udid, 'screenshot', `${out}/${name}.png`]);

function nodes() {
  const tree = JSON.parse(sh('maestro', ['--device', udid, 'hierarchy']));
  const list = [];
  const walk = (n) => {
    if (!n) return;
    const a = n.attributes ?? {};
    list.push({ label: a.accessibilityText ?? '', text: a.text ?? '', bounds: a.bounds ?? '' });
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return list;
}
const centre = (b) => {
  const m = b.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  return m ? { x: (+m[1] + +m[3]) / 2, y: (+m[2] + +m[4]) / 2 } : null;
};
const find = (label) => nodes().find((n) => n.label === label || n.label.startsWith(label + ' ') || n.label === label);
const square = (sq) => nodes().find((n) => n.label === sq || n.label.startsWith(`${sq} `));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!ok) failed++;
};

async function waitFor(fn, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = fn();
      if (v) return v;
    } catch {}
    await sleep(2000);
  }
  return null;
}

const base = 'exp://127.0.0.1:8081/--';
// Expo Go may show its own onboarding the first time; dismiss anything with "Continue"/"Got it".
await sleep(20000);
shot('00-launch');
try { flow('dismiss', `- tapOn:\n    text: "Continue"\n    optional: true\n- tapOn:\n    text: "Got it"\n    optional: true`); } catch {}
const guest = await waitFor(() => nodes().find((n) => /Continue as guest/.test(n.text + n.label)), 240000);
shot('01-welcome');
check('app loaded to welcome screen', !!guest);
if (guest) flow('guest', `- tapOn:\n    text: "Continue as guest"`);
await sleep(4000);
sh('xcrun', ['simctl', 'openurl', udid, `${base}/play/local`]);
const e2 = await waitFor(() => square('e2'), 120000);
shot('02-board');
check('practice board shown', !!e2, e2?.label);
if (!e2) process.exit(1);

const pt = (sq) => centre(square(sq).bounds);

// 1. Drag and drop e2 -> e4.
let a = pt('e2'), b = pt('e4');
flow('drag', `- swipe:\n    start: ${Math.round(a.x)}, ${Math.round(a.y)}\n    end: ${Math.round(b.x)}, ${Math.round(b.y)}\n    duration: 700`);
await sleep(1500);
shot('03-after-drag');
check('drag e2-e4 moves the pawn', /white p/.test(square('e4')?.label ?? '') && !/white p/.test(square('e2')?.label ?? ''), `e4="${square('e4')?.label}" e2="${square('e2')?.label}"`);

// 2. Tap to move e7 -> e5.
a = pt('e7');
b = pt('e5');
flow('tap1', `- tapOn:\n    point: ${Math.round(a.x)},${Math.round(a.y)}`);
await sleep(1200);
shot('04-selected');
flow('tap2', `- tapOn:\n    point: ${Math.round(b.x)},${Math.round(b.y)}`);
await sleep(1500);
shot('05-after-tap-move');
check('tap e7 then e5 moves the pawn', /black p/.test(square('e5')?.label ?? ''), `e5="${square('e5')?.label}"`);

// 3. Illegal drag g1 -> g5 glides back.
a = pt('g1');
b = pt('g5');
flow('illegal', `- swipe:\n    start: ${Math.round(a.x)}, ${Math.round(a.y)}\n    end: ${Math.round(b.x)}, ${Math.round(b.y)}\n    duration: 700`);
await sleep(1500);
shot('06-after-illegal');
check('illegal drag leaves the knight on g1', /white n/.test(square('g1')?.label ?? ''), `g1="${square('g1')?.label}"`);

// 4. Drag knight g1 -> f3 (legal).
a = pt('g1');
b = pt('f3');
flow('knight', `- swipe:\n    start: ${Math.round(a.x)}, ${Math.round(a.y)}\n    end: ${Math.round(b.x)}, ${Math.round(b.y)}\n    duration: 500`);
await sleep(1500);
shot('07-after-knight');
check('drag g1-f3 moves the knight', /white n/.test(square('f3')?.label ?? ''), `f3="${square('f3')?.label}"`);

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
