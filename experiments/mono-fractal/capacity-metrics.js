// SPDX-License-Identifier: Apache-2.0
'use strict';

// Temporary global binding for app.js's farthestOrder() assignment. In strict mode,
// assigning to an undeclared identifier throws (Safari exposed this immediately).
// Keep this until farthestOrder() is refactored to declare minD locally.
var minD;

function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

function fanoLowerBound(states, accuracy) {
  if (states <= 1) return 0;
  const error = Math.max(0, Math.min(1, 1 - accuracy));
  return Math.max(0, Math.log2(states) - binaryEntropy(error) - error * Math.log2(states - 1));
}

function applyCapacityBounds() {
  if (typeof lastResult === 'undefined' || !lastResult) return;
  const pitch2 = lastResult.pitchMm * lastResult.pitchMm;
  const fullBound = fanoLowerBound(lastResult.symbols, lastResult.full.accuracy);
  lastResult.full.fanoLowerBoundBitsPerCell = fullBound;
  lastResult.full.fanoLowerBoundBitsPerMm2 = fullBound / pitch2;
  $('fano').textContent = `≥ ${fullBound.toFixed(3)} bit/cell`;
  $('fano-density').textContent = `≥ ${(fullBound / pitch2).toFixed(3)} bit/mm²`;

  for (const row of lastResult.subsets) {
    row.fanoLowerBoundBitsPerCell = fanoLowerBound(row.states, row.accuracy);
    row.fanoLowerBoundBitsPerMm2 = row.fanoLowerBoundBitsPerCell / pitch2;
  }
  $('subset-body').innerHTML = lastResult.subsets.map(r => `<tr>
    <td>${r.states}</td>
    <td>${r.rawBits.toFixed(3)}</td>
    <td>${(100 * r.accuracy).toFixed(2)}%</td>
    <td>≥ ${r.fanoLowerBoundBitsPerCell.toFixed(3)}</td>
    <td>≥ ${r.fanoLowerBoundBitsPerMm2.toFixed(3)}</td>
    <td>${r.mi.toFixed(3)}</td>
  </tr>`).join('');
}

new MutationObserver(() => {
  if (!$('results').hidden) queueMicrotask(applyCapacityBounds);
}).observe($('results'), { attributes: true, attributeFilter: ['hidden'] });
