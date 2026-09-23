/* Safe calculator: a tiny recursive-descent parser. No eval, no Function —
   only numbers, + - * / ^ %, parentheses, a few functions and constants. */

const FN = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
const CONST = { pi: Math.PI, e: Math.E };

export function calc(src) {
  const s = src.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const eat = (c) => (s[i] === c ? (i++, true) : false);

  function num() {
    const m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/);
    if (m) {
      i += m[0].length;
      return parseFloat(m[0]);
    }
    const w = s.slice(i).match(/^[a-z]+/);
    if (w) {
      i += w[0].length;
      if (w[0] in CONST) return CONST[w[0]];
      if (w[0] in FN) {
        if (!eat('(')) throw new Error('( expected');
        const v = add();
        if (!eat(')')) throw new Error(') expected');
        return FN[w[0]](v);
      }
      throw new Error(`unknown “${w[0]}”`);
    }
    if (eat('(')) {
      const v = add();
      if (!eat(')')) throw new Error(') expected');
      return v;
    }
    throw new Error('number expected');
  }
  function unary() {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    let v = num();
    if (eat('%')) v /= 100;
    return v;
  }
  function pow() {
    const b = unary();
    return eat('^') ? b ** pow() : b;
  }
  function mul() {
    let v = pow();
    for (;;) {
      if (eat('*')) v *= pow();
      else if (eat('/')) v /= pow();
      else return v;
    }
  }
  function add() {
    let v = mul();
    for (;;) {
      if (eat('+')) v += mul();
      else if (eat('-')) v -= mul();
      else return v;
    }
  }
  const v = add();
  if (i < s.length) throw new Error(`unexpected “${peek()}”`);
  if (!Number.isFinite(v)) throw new Error('not a finite number');
  return v;
}

const WORDS = new RegExp(`\\b(${[...Object.keys(FN), ...Object.keys(CONST)].join('|')})\\b`, 'gi');
export const looksLikeMath = (s) => /\d/.test(s) && /[+\-*/^%×÷(]/.test(s) && /^[\d\s.+\-*/^%()×÷,]*$/.test(s.replace(WORDS, ''));
