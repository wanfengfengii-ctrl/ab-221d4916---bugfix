'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const solver = require('../src/solver.js');

/* M = 2^53 + 1：超出 Number 安全整数范围，Number 无法精确表示 */
const M = 9007199254740993n;
const M2 = 2n * M; // 18014398509481986
const M3 = 3n * M; // 27021597764222979
const M4 = 4n * M; // 36028797018963972
const M6 = 6n * M; // 54043195528445958

function runLengths(runs) {
  return runs.map((r) => r.length);
}

function byValue(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tokensKey(tokens) {
  return tokens.map(String).join('|');
}

function reversedTokensKey(map) {
  const frags = map.fragments.slice().reverse();
  const sites = map.sites.slice().reverse();
  const t = [frags[0]];
  for (let i = 0; i < sites.length; i++) {
    t.push(sites[i]);
    t.push(frags[i + 1]);
  }
  return tokensKey(t);
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

test('输入校验：总长度非法', () => {
  const res = solver.solve({ total: 'abc', A: [4], B: [4], D: [4] });
  assert.equal(res.status, 'invalid');
  assert.ok(res.issues.some((i) => i.group === 'total'));
});

test('唯一图谱（自反向，含合并展示数据）', () => {
  const res = solver.solve({ total: 6, A: [2, 2, 2], B: [3, 3], D: [1, 1, 2, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [2n, 1n, 1n, 2n]);
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts, [2n, 3n, 4n]);
  assert.equal(m.total, 6n);
  assert.deepEqual(runLengths(m.aRuns), [2n, 2n, 2n]);
  assert.deepEqual(runLengths(m.bRuns), [3n, 3n]);
  assert.deepEqual(m.aRuns[1], { start: 1, end: 3, length: 2n });
});

test('唯一图谱（整体反向去重，规范方向展示）', () => {
  const res = solver.solve({ total: 4, A: [1, 3], B: [2, 2], D: [1, 1, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [1n, 1n, 2n]);
  assert.deepEqual(m.sites, ['A', 'B']);
  assert.deepEqual(m.cuts, [1n, 2n]);
});

test('双切点（两种酶共切同一位点）', () => {
  const res = solver.solve({ total: 4, A: [1, 1, 2], B: [2, 2], D: [1, 1, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [1n, 1n, 2n]);
  assert.deepEqual(m.sites, ['A', 'AB']);
  assert.deepEqual(m.cuts, [1n, 2n]);
  assert.deepEqual(runLengths(m.aRuns), [1n, 1n, 2n]);
  assert.deepEqual(runLengths(m.bRuns), [2n, 2n]);
});

test('多解：两份见证、非反向等价、首个分歧明确', () => {
  const res = solver.solve({ total: 8, A: [1, 2, 5], B: [3, 5], D: [1, 2, 2, 3] });
  assert.equal(res.status, 'multiple');
  assert.equal(res.solutions.length, 2);
  const [w1, w2] = res.solutions;
  for (const w of [w1, w2]) {
    assert.deepEqual(runLengths(w.aRuns).sort(byValue), [1n, 2n, 5n]);
    assert.deepEqual(runLengths(w.bRuns).sort(byValue), [3n, 5n]);
    assert.deepEqual(w.fragments.slice().sort(byValue), [1n, 2n, 2n, 3n]);
    assert.equal(w.total, 8n);
  }
  // 两份见证互不相同，且并非互为整体反向
  assert.notEqual(tokensKey(w1.tokens), tokensKey(w2.tokens));
  assert.notEqual(reversedTokensKey(w1), tokensKey(w2.tokens));
  // 首个分歧存在，坐标与双方取值一致
  const div = res.divergence;
  assert.ok(div);
  assert.ok(typeof div.coordinate === 'bigint' && div.coordinate >= 0n);
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
  assert.ok(solver.parseFragments('1e3').error);
  assert.ok(solver.parseFragments('0x10').error);
});

test('parseFragments 精确解析任意位数的十进制正整数', () => {
  const p = solver.parseFragments('9007199254740993, 18014398509481986 54043195528445958');
  assert.equal(p.error, null);
  assert.deepEqual(p.values, [M, M2, M6]);
  // Number 解析会舍入（9007199254740993 → 9007199254740992），BigInt 保持原值
  assert.notEqual(BigInt(Number('9007199254740993')), M);
});

test('parseInteger 解析总长度（含超大值与非法输入）', () => {
  assert.equal(solver.parseInteger('54043195528445958').value, M6);
  assert.equal(solver.parseInteger(' 6 ').value, 6n);
  assert.ok(solver.parseInteger('').error);
  assert.ok(solver.parseInteger('0').error);
  assert.ok(solver.parseInteger('-3').error);
  assert.ok(solver.parseInteger('2.5').error);
  assert.ok(solver.parseInteger('1e3').error);
});

test('超大十进制正整数：文本录入到唯一图谱全链路精确', () => {
  const pT = solver.parseInteger('54043195528445958');
  const pA = solver.parseFragments('18014398509481986, 18014398509481986, 18014398509481986');
  const pB = solver.parseFragments('27021597764222979, 27021597764222979');
  const pD = solver.parseFragments('9007199254740993, 9007199254740993, 18014398509481986, 18014398509481986');
  assert.ok(!pT.error && !pA.error && !pB.error && !pD.error);
  const res = solver.solve({ total: pT.value, A: pA.values, B: pB.values, D: pD.values });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [M2, M, M, M2]);
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts, [M2, M3, M4]);
  assert.equal(m.total, M6);
  assert.deepEqual(runLengths(m.aRuns), [M2, M2, M2]);
  assert.deepEqual(runLengths(m.bRuns), [M3, M3]);
  // 展示层字符串化即为原十进制文本
  assert.equal(String(m.fragments[0]), '18014398509481986');
  assert.equal(String(m.cuts[1]), '27021597764222979');
  assert.equal(String(m.total), '54043195528445958');
});

test('超大整数：BigInt 与十进制字符串输入等价', () => {
  const byBigInt = solver.solve({ total: M6, A: [M2, M2, M2], B: [M3, M3], D: [M, M, M2, M2] });
  assert.equal(byBigInt.status, 'unique');
  assert.equal(byBigInt.total, M6);
  const byString = solver.solve({
    total: '54043195528445958',
    A: ['18014398509481986', '18014398509481986', '18014398509481986'],
    B: ['27021597764222979', '27021597764222979'],
    D: ['9007199254740993', '9007199254740993', '18014398509481986', '18014398509481986']
  });
  assert.equal(byString.status, 'unique');
  assert.deepEqual(byString.solutions[0].fragments, [M2, M, M, M2]);
  assert.deepEqual(byString.solutions[0].sites, ['A', 'B', 'A']);
  assert.deepEqual(byString.solutions[0].cuts, [M2, M3, M4]);
});

test('超大整数：片段之和与总长度的核对精确到个位', () => {
  const res = solver.solve({ total: M6 + 1n, A: [M2, M2, M2], B: [M3, M3], D: [M, M, M2, M2] });
  assert.equal(res.status, 'invalid');
  assert.equal(res.issues.length, 3);
  for (const issue of res.issues) {
    assert.ok(issue.message.includes('54043195528445958'));
    assert.ok(issue.message.includes('54043195528445959'));
  }
});
