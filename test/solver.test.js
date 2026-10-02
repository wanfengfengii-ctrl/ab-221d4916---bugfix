'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const solver = require('../src/solver.js');

function runLengths(runs) {
  return runs.map((r) => r.length);
}

// 长度以 BigInt 精确表示；断言与排序统一走 BigInt。
const bi = (x) => BigInt(x);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const nbi = (arr) => arr.map(bi);

function tokenText(toks) {
  return toks.map((x) => (typeof x === 'bigint' ? 'n:' + x.toString() : 's:' + x)).join('|');
}

function reversedTokensJson(map) {
  const frags = map.fragments.slice().reverse();
  const sites = map.sites.slice().reverse();
  const t = [frags[0]];
  for (let i = 0; i < sites.length; i++) {
    t.push(sites[i]);
    t.push(frags[i + 1]);
  }
  return tokenText(t);
}

test('输入校验：某组片段之和不等于总长度', () => {
  const res = solver.solve({ total: 10, A: [6, 4], B: [5, 5], D: [1, 2, 3, 3] });
  assert.equal(res.status, 'invalid');
  assert.ok(res.issues.some((i) => i.group === 'D'));
});

test('输入校验：非正整数片段与空列表', () => {
  const r1 = solver.solve({ total: 4, A: [4], B: [4], D: [0, 4] });
  assert.equal(r1.status, 'invalid');
  assert.ok(r1.issues.some((i) => i.group === 'D'));
  const r2 = solver.solve({ total: 4, A: [], B: [4], D: [4] });
  assert.equal(r2.status, 'invalid');
  assert.ok(r2.issues.some((i) => i.group === 'A'));
});

test('唯一图谱（自反向，含合并展示数据）', () => {
  const res = solver.solve({ total: 6, A: [2, 2, 2], B: [3, 3], D: [1, 1, 2, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, nbi([2, 1, 1, 2]));
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts, nbi([2, 3, 4]));
  assert.deepEqual(runLengths(m.aRuns), nbi([2, 2, 2]));
  assert.deepEqual(runLengths(m.bRuns), nbi([3, 3]));
  assert.deepEqual(m.aRuns[1], { start: 1, end: 3, length: 2n });
});

test('唯一图谱（整体反向去重，规范方向展示）', () => {
  const res = solver.solve({ total: 4, A: [1, 3], B: [2, 2], D: [1, 1, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, nbi([1, 1, 2]));
  assert.deepEqual(m.sites, ['A', 'B']);
  assert.deepEqual(m.cuts, nbi([1, 2]));
});

test('双切点（两种酶共切同一位点）', () => {
  const res = solver.solve({ total: 4, A: [1, 1, 2], B: [2, 2], D: [1, 1, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, nbi([1, 1, 2]));
  assert.deepEqual(m.sites, ['A', 'AB']);
  assert.deepEqual(m.cuts, nbi([1, 2]));
  assert.deepEqual(runLengths(m.aRuns), nbi([1, 1, 2]));
  assert.deepEqual(runLengths(m.bRuns), nbi([2, 2]));
});

test('多解：两份见证、非反向等价、首个分歧明确', () => {
  const res = solver.solve({ total: 8, A: [1, 2, 5], B: [3, 5], D: [1, 2, 2, 3] });
  assert.equal(res.status, 'multiple');
  assert.equal(res.solutions.length, 2);
  const [w1, w2] = res.solutions;
  for (const w of [w1, w2]) {
    assert.deepEqual(runLengths(w.aRuns).sort(cmp), nbi([1, 2, 5]));
    assert.deepEqual(runLengths(w.bRuns).sort(cmp), nbi([3, 5]));
    assert.deepEqual(w.fragments.slice().sort(cmp), nbi([1, 2, 2, 3]));
    assert.equal(w.total, 8n);
  }
  // 两份见证互不相同，且并非互为整体反向
  assert.notEqual(tokenText(w1.tokens), tokenText(w2.tokens));
  assert.notEqual(reversedTokensJson(w1), tokenText(w2.tokens));
  // 首个分歧存在，坐标与双方取值一致
  const div = res.divergence;
  assert.ok(div);
  assert.equal(typeof div.coordinate, 'bigint');
  assert.ok(div.coordinate >= 0n);
  assert.equal(w1.tokens[div.tokenIndex], div.first);
  assert.equal(w2.tokens[div.tokenIndex], div.second);
  assert.ok(div.tokenIndex >= 0);
});

test('无可行图谱：酶A单酶切最先无法同时满足', () => {
  const res = solver.solve({ total: 10, A: [2, 8], B: [4, 6], D: [1, 3, 3, 3] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'A');
  assert.deepEqual(res.failure.passed, []);
});

test('无可行图谱：酶B单酶切最先无法同时满足', () => {
  const res = solver.solve({ total: 10, A: [4, 6], B: [2, 8], D: [1, 3, 3, 3] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'B');
  assert.deepEqual(res.failure.passed, ['A']);
});

test('无可行图谱：双酶切联合（切点总数不足）', () => {
  const res = solver.solve({ total: 10, A: [6, 4], B: [5, 5], D: [1, 2, 3, 4] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'double');
  assert.deepEqual(res.failure.passed, ['A', 'B']);
});

test('无可行图谱：双酶切联合（各自可行但不可兼得）', () => {
  const res = solver.solve({ total: 6, A: [1, 5], B: [1, 5], D: [1, 2, 3] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'double');
  assert.deepEqual(res.failure.passed, ['A', 'B']);
});

test('单片段边界（无内部切点）', () => {
  const res = solver.solve({ total: 5, A: [5], B: [5], D: [5] });
  assert.equal(res.status, 'unique');
  assert.deepEqual(res.solutions[0].fragments, [5n]);
  assert.deepEqual(res.solutions[0].sites, []);
  assert.deepEqual(res.solutions[0].cuts, []);
});

test('枚举预算超限时中止', () => {
  const res = solver.solve({ total: 6, A: [2, 2, 2], B: [3, 3], D: [1, 1, 2, 2], budget: 1 });
  assert.equal(res.status, 'aborted');
});

test('parseFragments 解析多种分隔符与非法输入', () => {
  assert.deepEqual(solver.parseFragments('1, 2  3，4、5;6').values, [1n, 2n, 3n, 4n, 5n, 6n]);
  assert.ok(solver.parseFragments('1, 0').error);
  assert.ok(solver.parseFragments('x').error);
  assert.ok(solver.parseFragments('').error);
  assert.ok(solver.parseFragments('2.5').error);
});

test('超大十进制正整数：经文本录入保持精确整数并复原唯一图谱', () => {
  const M = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2，Number() 会取整
  const M2 = '18014398509481986';
  const M3 = '27021597764222979';
  const M4 = '36028797018963972';
  const M6 = '54043195528445958';
  const t = solver.parsePositiveInteger(M6);
  assert.equal(t.error, null);
  assert.equal(t.value.toString(), M6);
  const pA = solver.parseFragments([M2, M2, M2].join(', '));
  const pB = solver.parseFragments([M3, M3].join(' '));
  const pD = solver.parseFragments([M, M, M2, M2].join(','));
  assert.equal(pA.error, null);
  assert.equal(pB.error, null);
  assert.equal(pD.error, null);
  const res = solver.solve({ total: t.value, A: pA.values, B: pB.values, D: pD.values });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments.map(String), [M2, M, M, M2]);
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts.map(String), [M2, M3, M4]);
  assert.equal(m.total.toString(), M6);
  assert.deepEqual(m.aRuns.map((r) => r.length.toString()), [M2, M2, M2]);
  assert.deepEqual(m.bRuns.map((r) => r.length.toString()), [M3, M3]);
});

test('超大十进制正整数：和不匹配时按组精确报 invalid（不被双精度取整掩盖）', () => {
  const M = '9007199254740993';
  const M2 = '18014398509481986';
  const M6 = '54043195528445958';
  // 双酶切组给出三个 2M，合计 6M，与 A、B 同样为 6M → 合法；
  // 这里总长度故意改为 6M+1，三组之和都应被精确识别为不相等。
  const res = solver.solve({
    total: BigInt(M6) + 1n,
    A: [BigInt(M2), BigInt(M2), BigInt(M2)],
    B: [BigInt(M2), BigInt(M2), BigInt(M2)],
    D: [BigInt(M), BigInt(M), BigInt(M2), BigInt(M2)]
  });
  assert.equal(res.status, 'invalid');
  assert.deepEqual(res.issues.map((i) => i.group).sort(), ['A', 'B', 'D']);
});

test('总长度文本解析：前导零、超长整数与非法输入', () => {
  assert.equal(solver.parsePositiveInteger('  42 ').value.toString(), '42');
  assert.equal(solver.parsePositiveInteger('0009007199254740993').value.toString(), '9007199254740993');
  const huge = '9'.repeat(80);
  assert.equal(solver.parsePositiveInteger(huge).value.toString(), huge);
  assert.ok(solver.parsePositiveInteger('').error);
  assert.ok(solver.parsePositiveInteger('1e3').error);
  assert.ok(solver.parsePositiveInteger('-1').error);
  assert.ok(solver.parsePositiveInteger('1.0').error);
});
