/*
 * 三种业务结论验证：
 *   1. 唯一图谱：复原出唯一的切点顺序（整体反向视为同一图谱）；
 *   2. 多解见证：存在多个非反向等价图谱时，给出两份首个分歧明确的见证；
 *   3. 无可行图谱：指出最先无法同时满足的消化组。
 * 另附：超出 Number 安全整数范围的超大十进制正整数录入，仍精确复原唯一图谱。
 */
'use strict';
const assert = require('node:assert/strict');
const solver = require('../src/solver.js');

const SITE_LABEL = { A: '酶A', B: '酶B', AB: '酶A+酶B' };
const GROUP_LABEL = { A: '酶A单酶切', B: '酶B单酶切', double: '双酶切（联合）' };

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${e.message}`);
  }
}

function byValue(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function describeMap(m) {
  const parts = [];
  m.fragments.forEach((f, i) => {
    if (i > 0) parts.push(`—[${SITE_LABEL[m.sites[i - 1]]}@${m.cuts[i - 1]}]—`);
    parts.push(String(f));
  });
  return parts.join('');
}

/* 业务结论 1：唯一图谱 */
check('业务1 唯一图谱复原（total=6, A=[2,2,2], B=[3,3], D=[1,1,2,2]）', () => {
  const res = solver.solve({ total: 6, A: [2, 2, 2], B: [3, 3], D: [1, 1, 2, 2] });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [2n, 1n, 1n, 2n]);
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts, [2n, 3n, 4n]);
  assert.deepEqual(m.aRuns.map((r) => r.length), [2n, 2n, 2n]);
  assert.deepEqual(m.bRuns.map((r) => r.length), [3n, 3n]);
  console.log(`  图谱: ${describeMap(m)}`);
  console.log('  酶A合并: [2]=D1, [2]=D2+D3, [2]=D4；酶B合并: [3]=D1+D2, [3]=D3+D4');
});

/* 业务结论 2：多解见证 */
check('业务2 多解见证（total=8, A=[1,2,5], B=[3,5], D=[1,2,2,3]）', () => {
  const res = solver.solve({ total: 8, A: [1, 2, 5], B: [3, 5], D: [1, 2, 2, 3] });
  assert.equal(res.status, 'multiple');
  assert.equal(res.solutions.length, 2);
  const [w1, w2] = res.solutions;
  for (const w of [w1, w2]) {
    assert.deepEqual(w.aRuns.map((r) => r.length).sort(byValue), [1n, 2n, 5n]);
    assert.deepEqual(w.bRuns.map((r) => r.length).sort(byValue), [3n, 5n]);
  }
  const div = res.divergence;
  assert.ok(div, '应给出首个分歧');
  assert.equal(w1.tokens[div.tokenIndex], div.first);
  assert.equal(w2.tokens[div.tokenIndex], div.second);
  console.log(`  见证1: ${describeMap(w1)}`);
  console.log(`  见证2: ${describeMap(w2)}`);
  const what = div.kind === 'fragment'
    ? `第 ${div.fragmentIndex + 1} 个双酶切片段（起点坐标 ${div.coordinate}）：${div.first} ↔ ${div.second}`
    : `坐标 ${div.coordinate} 处切点：${SITE_LABEL[div.first]} ↔ ${SITE_LABEL[div.second]}`;
  console.log(`  首个分歧: ${what}`);
});

/* 业务结论 3：无可行图谱，指出最先无法同时满足的消化组 */
check('业务3 无可行图谱（total=10, A=[2,8], B=[4,6], D=[1,3,3,3]）→ 酶A单酶切', () => {
  const res = solver.solve({ total: 10, A: [2, 8], B: [4, 6], D: [1, 3, 3, 3] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'A');
  console.log(`  最先无法同时满足的消化组: ${GROUP_LABEL[res.failure.group]}`);
  console.log(`  原因: ${res.failure.message}`);
});

check('业务3 补充：各自可行但联合不可行 → 双酶切（联合）', () => {
  const res = solver.solve({ total: 6, A: [1, 5], B: [1, 5], D: [1, 2, 3] });
  assert.equal(res.status, 'infeasible');
  assert.equal(res.failure.group, 'double');
  assert.deepEqual(res.failure.passed, ['A', 'B']);
  console.log(`  最先无法同时满足的消化组: ${GROUP_LABEL[res.failure.group]}`);
});

/* 业务结论 4：超大十进制正整数（超出 Number 安全整数范围）仍精确复原唯一图谱 */
check('业务4 超大整数唯一图谱（M=9007199254740993，total=6M=54043195528445958）', () => {
  const M = 9007199254740993n; // 2^53 + 1，Number 无法精确表示
  const pT = solver.parseInteger('54043195528445958');
  const pA = solver.parseFragments('18014398509481986, 18014398509481986, 18014398509481986');
  const pB = solver.parseFragments('27021597764222979, 27021597764222979');
  const pD = solver.parseFragments('9007199254740993, 9007199254740993, 18014398509481986, 18014398509481986');
  assert.ok(!pT.error && !pA.error && !pB.error && !pD.error);
  const res = solver.solve({ total: pT.value, A: pA.values, B: pB.values, D: pD.values });
  assert.equal(res.status, 'unique');
  const m = res.solutions[0];
  assert.deepEqual(m.fragments, [2n * M, M, M, 2n * M]);
  assert.deepEqual(m.sites, ['A', 'B', 'A']);
  assert.deepEqual(m.cuts, [2n * M, 3n * M, 4n * M]);
  assert.equal(m.total, 6n * M);
  assert.deepEqual(m.aRuns.map((r) => r.length), [2n * M, 2n * M, 2n * M]);
  assert.deepEqual(m.bRuns.map((r) => r.length), [3n * M, 3n * M]);
  console.log(`  图谱: ${describeMap(m)}`);
  console.log(`  总长度: ${m.total}（十进制精确展示）`);
});

if (failures) {
  console.error(`\n业务结论验证失败：${failures} 项`);
  process.exit(1);
}
console.log('\n三种业务结论全部验证通过');
