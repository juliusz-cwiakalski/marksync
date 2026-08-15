#!/usr/bin/env bun
/**
 * GH-90 historical-version API spike probe — zero-dependency Bun script
 *
 * Executes spec §5.1 10-case matrix:
 *   V1-HIST-v2, V1-CURR, V1-META-v2, V1-NOVER
 *   V2-HIST-v2, V2-VERSLIST, V2-VERSN-2, V2-NOVER
 *   V1-TRASHED-hist, V1-TRASHED-curr, V1-TRASHED-probe (optional)
 *   V2-TRASHED-hist, V2-TRASHED-curr
 *
 * Outputs: gh-90-evidence/ with sanitized captures, ledger.json, provenance.json
 *
 * CEO-waiver-authorized: spike-branch-only; uses only Bun/Node stdlib (no install)
 *
 * Redaction contract (spec §20):
 *   - accountIds masked as «account-1», «account-2» (preserve distinctness)
 *   - emails redacted outright
 *   - auth header value never captured or logged
 *   - Hard FAIL if any output contains token/email/"Authorization" (self-check)
 */

import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// Environment contract (task 1.13 step 1)
const env = {
  BASE_URL: process.env.MARKSYNC_E2E_CONFLUENCE_BASE_URL,
  EMAIL: process.env.MARKSYNC_E2E_USER_EMAIL,
  TOKEN: process.env.MARKSYNC_E2E_API_TOKEN,
  SPACE_KEY: process.env.MARKSYNC_E2E_SPACE_KEY,
  PARENT_PAGE_ID: process.env.MARKSYNC_E2E_PARENT_PAGE_ID,
};

for (const [key, value] of Object.entries(env)) {
  if (!value) {
    console.error(`FAIL: Missing env var MARKSYNC_E2E_${key}`);
    process.exit(1);
  }
}

// Auth header computed in memory only (never printed or logged)
const authHeader = `Basic ${Buffer.from(`${env.EMAIL}:${env.TOKEN}`).toString('base64')}`;

const outputDir = 'gh-90-evidence';
fs.mkdirSync(outputDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ledger = { requests: [], total: 0 };
const provenance = {
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || 'unknown',
  GITHUB_SHA: process.env.GITHUB_SHA || 'unknown',
  runDate: new Date().toISOString(),
  cleanupMode: 'trash',
};

// Account ID tracker for stable masking
const accountIds = new Map();
let accountIdCounter = 1;

function maskAccountId(id) {
  if (!id) return id;
  if (!accountIds.has(id)) {
    accountIds.set(id, `«account-${accountIdCounter++}»`);
  }
  return accountIds.get(id);
}

// Redaction functions
function sanitizeBody(body) {
  let result = body;

  // Mask accountIds (32-char hex)
  result = result.replace(/[0-9a-f]{32}/g, (match) => {
    return maskAccountId(match);
  });

  // Redact emails (heuristic: pattern with @ and domain)
  result = result.replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '«email-redacted»');

  return result;
}

async function fetchWithBackoff(url, options) {
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    const response = await fetch(url, options);
    const status = response.status;

    // Log the request to ledger
    ledger.requests.push({
      method: options.method || 'GET',
      path: new URL(url).pathname + new URL(url).search,
      status,
    });
    ledger.total++;

    // Handle 429 with backoff
    if (status === 429) {
      attempt++;
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
        console.log(`  429 throttle detected, backing off ${delay}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(delay);
        continue;
      }
    }

    return response;
  }

  throw new Error(`Max attempts (${maxAttempts}) exceeded for ${options.method} ${url}`);
}

function writeCapture(caseName, method, path, status, body) {
  const sanitized = sanitizeBody(body);

  const capture = {
    case: caseName,
    request: {
      method,
      path,
    },
    status,
    sanitizedBody: sanitized,
  };

  const filename = `${outputDir}/${caseName}.json`;
  fs.writeFileSync(filename, JSON.stringify(capture, null, 2));
  console.log(`  Captured: ${caseName} (status ${status})`);
}

async function main() {
  console.log('GH-90 historical-version probe started');

  // Step 2: Fixture provisioning (task 1.13 step 2)
  console.log('Step 1: Creating fixture page...');

  const fixtureTitle = `GH-90 spike fixture ${timestamp}`;
  const fixtureBodyV1 = '<p>GH-90 spike fixture — body v1 (synthetic)</p>';
  const fixtureBodyV2 = '<p>GH-90 spike fixture — body v2 (synthetic, distinct)</p>';
  const fixtureBodyV3 = '<p>GH-90 spike fixture — body v3 (synthetic, distinct again)</p>';

  const createPayload = {
    type: 'page',
    title: fixtureTitle,
    space: { key: env.SPACE_KEY },
    ancestors: [{ id: env.PARENT_PAGE_ID }],
    body: {
      storage: {
        value: fixtureBodyV1,
        representation: 'storage',
      },
    },
  };

  const createResponse = await fetchWithBackoff(`${env.BASE_URL}/wiki/rest/api/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(createPayload),
  });

  if (!createResponse.ok) {
    console.error(`FAIL: Fixture creation failed: ${createResponse.status}`);
    process.exit(1);
  }

  const createResult = await createResponse.json();
  const pageId = createResult.id;
  provenance.fixtureTitle = fixtureTitle;
  console.log(`  Created page: ${pageId} (version 1)`);

  // Bump to v2
  const updatePayloadV2 = {
    id: pageId,
    type: 'page',
    title: fixtureTitle,
    version: {
      number: 2,
      message: 'GH-90 spike bump v2',
    },
    body: {
      storage: {
        value: fixtureBodyV2,
        representation: 'storage',
      },
    },
  };

  const updateResponseV2 = await fetchWithBackoff(`${env.BASE_URL}/wiki/rest/api/content/${pageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(updatePayloadV2),
  });

  if (!updateResponseV2.ok) {
    console.error(`FAIL: Fixture v2 update failed: ${updateResponseV2.status}`);
    process.exit(1);
  }
  console.log(`  Bumped to version 2`);

  // Bump to v3
  const updatePayloadV3 = {
    id: pageId,
    type: 'page',
    title: fixtureTitle,
    version: {
      number: 3,
      message: 'GH-90 spike bump v3',
    },
    body: {
      storage: {
        value: fixtureBodyV3,
        representation: 'storage',
      },
    },
  };

  const updateResponseV3 = await fetchWithBackoff(`${env.BASE_URL}/wiki/rest/api/content/${pageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(updatePayloadV3),
  });

  if (!updateResponseV3.ok) {
    console.error(`FAIL: Fixture v3 update failed: ${updateResponseV3.status}`);
    process.exit(1);
  }
  console.log(`  Bumped to version 3`);

  // Step 3: Matrix captures (task 1.13 step 3)
  console.log('Step 2: Capturing pre-trash matrix cases...');

  // V1-HIST-v2
  const v1HistResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-HIST-v2',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage`,
    v1HistResponse.status,
    await v1HistResponse.text()
  );

  // V1-CURR
  const v1CurrResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=current&expand=body.storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-CURR',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=current&expand=body.storage`,
    v1CurrResponse.status,
    await v1CurrResponse.text()
  );

  // V1-META-v2 (combined expand: body.storage + version)
  const v1MetaResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage,version`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-META-v2',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage,version`,
    v1MetaResponse.status,
    await v1MetaResponse.text()
  );

  // V1-NOVER (version 99 doesn't exist)
  const v1NoVerResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=historical&version=99&expand=body.storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-NOVER',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=historical&version=99&expand=body.storage`,
    v1NoVerResponse.status,
    await v1NoVerResponse.text()
  );

  // V2-HIST-v2
  const v2HistResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/api/v2/pages/${pageId}?version=2&body-format=storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V2-HIST-v2',
    'GET',
    `/wiki/api/v2/pages/${pageId}?version=2&body-format=storage`,
    v2HistResponse.status,
    await v2HistResponse.text()
  );

  // V2-VERSLIST
  const v2VersListResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/api/v2/pages/${pageId}/versions?body-format=storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V2-VERSLIST',
    'GET',
    `/wiki/api/v2/pages/${pageId}/versions?body-format=storage`,
    v2VersListResponse.status,
    await v2VersListResponse.text()
  );

  // V2-VERSN-2
  const v2VersN2Response = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/api/v2/pages/${pageId}/versions/2`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V2-VERSN-2',
    'GET',
    `/wiki/api/v2/pages/${pageId}/versions/2`,
    v2VersN2Response.status,
    await v2VersN2Response.text()
  );

  // V2-NOVER (version 99 doesn't exist)
  const v2NoVerResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/api/v2/pages/${pageId}?version=99&body-format=storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V2-NOVER',
    'GET',
    `/wiki/api/v2/pages/${pageId}?version=99&body-format=storage`,
    v2NoVerResponse.status,
    await v2NoVerResponse.text()
  );

  // Step 4: Trash + post-trash captures (task 1.13 step 4)
  console.log('Step 3: Trashing page and capturing post-trash cases...');

  const trashResponse = await fetchWithBackoff(`${env.BASE_URL}/wiki/rest/api/content/${pageId}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });

  if (!trashResponse.ok) {
    console.error(`FAIL: Trash failed: ${trashResponse.status}`);
    process.exit(1);
  }
  console.log(`  Trashed page (status ${trashResponse.status})`);

  // Post-trash captures
  // V1-TRASHED-hist
  const v1TrashedHistResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-TRASHED-hist',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=historical&version=2&expand=body.storage`,
    v1TrashedHistResponse.status,
    await v1TrashedHistResponse.text()
  );

  // V1-TRASHED-curr
  const v1TrashedCurrResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=current&expand=body.storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V1-TRASHED-curr',
    'GET',
    `/wiki/rest/api/content/${pageId}?status=current&expand=body.storage`,
    v1TrashedCurrResponse.status,
    await v1TrashedCurrResponse.text()
  );

  // V1-TRASHED-probe (optional: status=trashed)
  try {
    const v1TrashedProbeResponse = await fetchWithBackoff(
      `${env.BASE_URL}/wiki/rest/api/content/${pageId}?status=trashed&expand=body.storage`,
      {
        headers: { Authorization: authHeader },
      }
    );
    writeCapture(
      'V1-TRASHED-probe',
      'GET',
      `/wiki/rest/api/content/${pageId}?status=trashed&expand=body.storage`,
      v1TrashedProbeResponse.status,
      await v1TrashedProbeResponse.text()
    );
  } catch (e) {
    console.log('  V1-TRASHED-probe: skipped (optional)');
  }

  // V2-TRASHED-hist
  const v2TrashedHistResponse = await fetchWithBackoff(
    `${env.BASE_URL}/wiki/api/v2/pages/${pageId}?version=2&body-format=storage`,
    {
      headers: { Authorization: authHeader },
    }
  );
  writeCapture(
    'V2-TRASHED-hist',
    'GET',
    `/wiki/api/v2/pages/${pageId}?version=2&body-format=storage`,
    v2TrashedHistResponse.status,
    await v2TrashedHistResponse.text()
  );

  // V2-TRASHED-curr
  const v2TrashedCurrResponse = await fetchWithBackoff(`${env.BASE_URL}/wiki/api/v2/pages/${pageId}`, {
    headers: { Authorization: authHeader },
  });
  writeCapture(
    'V2-TRASHED-curr',
    'GET',
    `/wiki/api/v2/pages/${pageId}`,
    v2TrashedCurrResponse.status,
    await v2TrashedCurrResponse.text()
  );

  // Step 5: Write ledger and provenance (task 1.13 step 5)
  console.log('Step 4: Writing ledger and provenance...');

  fs.writeFileSync(`${outputDir}/ledger.json`, JSON.stringify(ledger, null, 2));
  fs.writeFileSync(`${outputDir}/provenance.json`, JSON.stringify(provenance, null, 2));

  console.log(`  Total requests: ${ledger.total}`);

  // Step 6: Self-check (task 1.13 step 6) - hard FAIL if any secret leaked
  console.log('Step 5: Running self-check for redaction violations...');

  const forbiddenPatterns = [
    env.TOKEN,
    env.EMAIL,
    'Authorization',
  ];

  for (const filename of fs.readdirSync(outputDir)) {
    const filePath = `${outputDir}/${filename}`;
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const pattern of forbiddenPatterns) {
      if (content.includes(pattern)) {
        console.error(`FAIL: Redaction violation in ${filename}: contains "${pattern.substring(0, 20)}..."`);
        console.error(`  The artifact will NOT be uploaded.`);
        process.exit(1);
      }
    }
  }

  console.log('  Self-check passed: no redaction violations found');
  console.log('GH-90 probe completed successfully');
}

main().catch((error) => {
  console.error('FAIL:', error);
  process.exit(1);
});