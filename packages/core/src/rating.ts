/**
 * Glicko-2 rating system (Glickman, 2012). Ratings are on the familiar
 * 1500-centred scale; internally converted to the Glicko-2 scale.
 */
export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface RatedResult {
  opponent: Rating;
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
}

export const DEFAULT_RATING: Rating = { rating: 1500, rd: 350, volatility: 0.06 };

const SCALE = 173.7178;
const TAU = 0.5;
const EPS = 1e-6;
const MIN_RD = 45;
const MAX_RD = 350;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

export function updateRating(player: Rating, results: RatedResult[]): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...player, rd: clamp(phiStar * SCALE, MIN_RD, MAX_RD) };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ = (r.opponent.rating - 1500) / SCALE;
    const phiJ = r.opponent.rd / SCALE;
    const e = E(mu, muJ, phiJ);
    const gj = g(phiJ);
    vInv += gj * gj * e * (1 - e);
    deltaSum += gj * (r.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Volatility via the Illinois algorithm.
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return {
    rating: newMu * SCALE + 1500,
    rd: clamp(newPhi * SCALE, MIN_RD, MAX_RD),
    volatility: newSigma,
  };
}

/** Rating is provisional (shown with "?") while RD is high. */
export function isProvisional(r: Rating): boolean {
  return r.rd > 110;
}

export function expectedOutcome(a: Rating, b: Rating): number {
  return E((a.rating - 1500) / SCALE, (b.rating - 1500) / SCALE, Math.hypot(a.rd, b.rd) / SCALE);
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
