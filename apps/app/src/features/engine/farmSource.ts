/**
 * The engine "farm": plain JavaScript that owns the Stockfish workers and their
 * queue, so searches keep flowing even while the app is busy drawing. It runs
 * in its own Web Worker on the web, and inside the hidden WebView page on
 * iOS/Android; the app only sends searches and receives finished results.
 *
 * `createFarm(makeEngine, size, post)` returns `onMessage(msg)`. Messages in:
 *   {t:'search', id, fen, depth, multipv, movetime?, urgent?}   {t:'cancel', id}
 * Messages out (through `post`):
 *   {t:'ready', size}  {t:'result', id, lines: string[], best: string|null}
 *   {t:'cancelled', id}  {t:'error', message}
 * `lines` are the last complete "info ... pv ..." line for each multipv index.
 */
export const FARM_SOURCE = String.raw`
function createFarm(makeEngine, size, post) {
  var slots = [], queue = [], readyCount = 0, failed = false;
  function fail(message) {
    if (failed) return;
    failed = true;
    post({ t: 'error', message: message || 'Engine stopped' });
  }
  function pump() {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s.ready || s.job || !queue.length) continue;
      var job = queue.shift();
      s.job = job;
      if (job.multipv !== s.multipv) { s.engine.postMessage('setoption name MultiPV value ' + job.multipv); s.multipv = job.multipv; }
      s.engine.postMessage('position fen ' + job.fen);
      s.engine.postMessage('go depth ' + job.depth + (job.movetime ? ' movetime ' + job.movetime : ''));
    }
  }
  function onLine(s, l) {
    if (l === 'uciok') { s.engine.postMessage('setoption name Hash value 16'); s.engine.postMessage('isready'); return; }
    if (l === 'readyok') {
      if (!s.ready) { s.ready = true; if (++readyCount === 1) post({ t: 'ready', size: slots.length }); pump(); }
      return;
    }
    var job = s.job;
    if (!job) return;
    if (l.indexOf('info depth') === 0 && l.indexOf(' pv ') > 0 && l.indexOf(' bound') < 0) {
      var m = / multipv (\d+)/.exec(l);
      job.lines[m ? m[1] : '1'] = l;
      return;
    }
    if (l.indexOf('bestmove') === 0) {
      s.job = null;
      if (job.cancelled) post({ t: 'cancelled', id: job.id });
      else {
        var best = l.split(' ')[1];
        var lines = Object.keys(job.lines).sort().map(function (k) { return job.lines[k]; });
        post({ t: 'result', id: job.id, lines: lines, best: best && best !== '(none)' ? best : null });
      }
      pump();
    }
  }
  for (var i = 0; i < size; i++) (function (k) {
    var s = { engine: null, ready: false, multipv: 1, job: null };
    s.engine = makeEngine(function (l) { onLine(s, String(l)); }, function (msg) { fail(msg); });
    slots.push(s);
    s.engine.postMessage('uci');
  })(i);
  return function onMessage(m) {
    if (!m || failed) return;
    if (m.t === 'search') {
      var job = { id: m.id, fen: m.fen, depth: m.depth, multipv: m.multipv || 1, movetime: m.movetime, lines: {} };
      if (m.urgent) queue.unshift(job); else queue.push(job);
      pump();
    } else if (m.t === 'cancel') {
      for (var q = 0; q < queue.length; q++) if (queue[q].id === m.id) { queue.splice(q, 1); post({ t: 'cancelled', id: m.id }); return; }
      for (var j = 0; j < slots.length; j++) if (slots[j].job && slots[j].job.id === m.id) { slots[j].job.cancelled = true; slots[j].engine.postMessage('stop'); }
    }
  };
}
`;
