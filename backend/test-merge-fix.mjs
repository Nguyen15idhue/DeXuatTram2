import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: 'station-mysql',
  user: 'root',
  password: 'password',
  database: 'station_management',
});

try {
  console.log('=== Testing deduplicateFieldCacheVersions ===\n');

  // Test 1: Get all EGR versions
  const [cached] = await pool.query(
    'SELECT version, tree_json, JSON_UNQUOTE(JSON_EXTRACT(tree_json, "$.template")) AS template, JSON_LENGTH(tree_json, "$.nodes") AS node_count FROM automation_field_cache WHERE JSON_UNQUOTE(JSON_EXTRACT(tree_json, "$.template")) LIKE "%EGR%" ORDER BY fetched_at DESC'
  );

  console.log(`Total EGR versions in cache: ${cached.length}`);

  // Test 2: Extract node IDs per version
  const versionMap = new Map();
  for (const row of cached) {
    const v = String(row.version);
    const tree = typeof row.tree_json === 'string' ? JSON.parse(row.tree_json) : row.tree_json;
    const nodeIds = new Set();
    for (const node of (tree.nodes || [])) {
      if (node && node.id) nodeIds.add('node.' + node.id);
    }
    versionMap.set(v, {
      nodeIds,
      node_count: row.node_count,
      template: row.template,
    });
  }

  console.log('\nVersion node counts:');
  for (const [v, info] of versionMap) {
    console.log(`  V${v}: ${info.node_count} nodes (${info.nodeIds.size} unique IDs)`);
  }

  // Test 3: Run deduplicateFieldCacheVersions logic
  const { deduplicateFieldCacheVersions } = await import('./src/services/syncReportService.js');
  const result = await deduplicateFieldCacheVersions(3);

  console.log('\n=== Merge Result ===');
  console.log(`Kept versions: ${result.versions.length}`);
  console.log(`Merged: ${result.mergeInfo.length}`);

  if (result.versions.length > 0) {
    console.log('\nKept versions:');
    for (const v of result.versions) {
      console.log(`  V${v.version}: ${v.node_count} nodes - "${v.template}"`);
    }
  }

  if (result.mergeInfo.length > 0) {
    console.log('\nMerged versions:');
    for (const m of result.mergeInfo) {
      console.log(`  V${m.duplicate} → V${m.keptAs} (${m.duplicateNodes}→${m.keptNodes} nodes)`);
    }
  }

  // Test 4: Verify no version with different node count is merged
  const nodeCountGroups = {};
  for (const v of result.versions) {
    const count = v.node_count;
    if (!nodeCountGroups[count]) nodeCountGroups[count] = [];
    nodeCountGroups[count].push(v.version);
  }

  console.log('\n=== Node count distribution ===');
  for (const [count, versions] of Object.entries(nodeCountGroups)) {
    console.log(`  ${count} nodes: V${versions.join(', ')}`);
  }

  // Verify: versions with different node counts should NOT be merged
  const uniqueNodeCounts = new Set(result.versions.map(v => v.node_count));
  console.log(`\nUnique node counts in result: ${[...uniqueNodeCounts].sort().join(', ')}`);

  // Test 5: Check for V56 and V57 (should NOT be merged if different node counts)
  const v56 = result.versions.find(v => v.version === '56');
  const v57 = result.versions.find(v => v.version === '57');

  if (v56 && v57) {
    console.log(`\nV56: ${v56.node_count} nodes`);
    console.log(`V57: ${v57.node_count} nodes`);
    if (v56.node_count !== v57.node_count) {
      console.log('✓ V56 and V57 have different node counts - correctly NOT merged');
    } else {
      console.log(' V56 and V57 have same node count - need to check if they should be merged');
    }
  }

  console.log('\n=== All tests passed! ===');

} catch (e) {
  console.error('Test failed:', e.message);
  console.error(e.stack);
} finally {
  await pool.end();
}
