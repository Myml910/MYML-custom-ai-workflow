#!/usr/bin/env node
/**
 * Audit workflow isolation and copy-related drift.
 *
 * This script is intentionally read-only. It scans workflow JSON files in:
 * - library/workflows                       legacy shared root
 * - library/users/<username>/workflows      isolated user roots
 * - public/workflows                        bundled public examples, when --include-public is used
 *
 * Usage:
 *   node server/audit-workflows.js
 *   node server/audit-workflows.js --json
 *   node server/audit-workflows.js --strict
 *   node server/audit-workflows.js --include-public
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { LIBRARY_DIR, PROJECT_ROOT } from './config/paths.js';

const args = new Set(process.argv.slice(2));
const OUTPUT_JSON = args.has('--json');
const STRICT = args.has('--strict');
const INCLUDE_PUBLIC = args.has('--include-public');
const HELP = args.has('--help') || args.has('-h');

const USER_WORKFLOWS_SEGMENT = 'workflows';
const SAFE_FILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LEGACY_ROOT_USERNAMES = new Set(['myml']);
const LIBRARY_URL_RE = /(?:https?:\/\/[^/\s"'<>]+)?\/library\/[^\s"'<>)]*/g;
const LEGACY_ASSET_URL_RE = /\/assets\/(?:images|videos)\/[^\s"'<>)]*/g;

if (HELP) {
    console.log(`MYML workflow audit

Usage:
  node server/audit-workflows.js [--json] [--strict] [--include-public]

Options:
  --json       Print the full machine-readable report.
  --strict     Exit with code 1 when errors or warnings are found.
  --include-public  Also scan bundled public/workflows templates.
`);
    process.exit(0);
}

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function relativeFromProject(filePath) {
    return toPosix(path.relative(PROJECT_ROOT, filePath));
}

function readDirSafe(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

function walkJsonFiles(rootDir) {
    const files = [];
    const walk = (dir) => {
        for (const entry of readDirSafe(dir)) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                files.push(fullPath);
            }
        }
    };

    if (fs.existsSync(rootDir)) {
        walk(rootDir);
    }
    return files;
}

function classifyLibraryWorkflowFile(filePath) {
    const rel = path.relative(LIBRARY_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;

    const segments = rel.split(path.sep);
    const workflowIndex = segments.indexOf(USER_WORKFLOWS_SEGMENT);
    if (workflowIndex === -1) return null;

    if (segments[0] === USER_WORKFLOWS_SEGMENT) {
        return {
            scope: 'legacy',
            owner: 'legacy-root',
            ownerKey: 'legacy-root',
            location: 'library/workflows'
        };
    }

    if (segments[0] === 'users' && segments[2] === USER_WORKFLOWS_SEGMENT && segments[1]) {
        return {
            scope: 'user',
            owner: segments[1],
            ownerKey: segments[1],
            location: `library/users/${segments[1]}/workflows`
        };
    }

    return {
        scope: 'unexpected',
        owner: null,
        ownerKey: 'unexpected',
        location: toPosix(path.dirname(rel))
    };
}

function discoverWorkflowFiles() {
    const byPath = new Map();

    for (const filePath of walkJsonFiles(LIBRARY_DIR)) {
        const classification = classifyLibraryWorkflowFile(filePath);
        if (!classification) continue;
        byPath.set(path.resolve(filePath), classification);
    }

    if (INCLUDE_PUBLIC) {
        const publicDir = path.join(PROJECT_ROOT, 'public', 'workflows');
        for (const filePath of walkJsonFiles(publicDir)) {
            byPath.set(path.resolve(filePath), {
                scope: 'public',
                owner: 'public',
                ownerKey: 'public',
                location: 'public/workflows'
            });
        }
    }

    return [...byPath.entries()]
        .map(([filePath, classification]) => ({ filePath, ...classification }))
        .sort((a, b) => relativeFromProject(a.filePath).localeCompare(relativeFromProject(b.filePath)));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }

    return JSON.stringify(value);
}

function stripWorkflowVolatileFields(value, { root = true } = {}) {
    if (Array.isArray(value)) {
        return value.map(item => stripWorkflowVolatileFields(item, { root: false }));
    }

    if (value && typeof value === 'object') {
        const copy = {};
        for (const [key, item] of Object.entries(value)) {
            if (root && ['id', 'createdAt', 'updatedAt'].includes(key)) continue;
            if (['generationStartTime', 'errorMessage'].includes(key)) continue;
            copy[key] = stripWorkflowVolatileFields(item, { root: false });
        }
        return copy;
    }

    return value;
}

function getWorkflowFingerprint(workflow) {
    return sha256(stableStringify(stripWorkflowVolatileFields(workflow)));
}

function normalizeUrlPath(rawUrl) {
    let value = String(rawUrl || '').trim();
    try {
        if (value.startsWith('http://') || value.startsWith('https://')) {
            value = new URL(value).pathname;
        }
    } catch {
        return null;
    }

    value = value.split(/[?#]/)[0];
    try {
        value = decodeURIComponent(value);
    } catch {
        return null;
    }
    return value;
}

function collectStringFindings(value, trail = [], findings = []) {
    if (typeof value === 'string') {
        if (value.startsWith('data:image/') || value.startsWith('data:video/')) {
            findings.push({
                type: 'data-url',
                path: trail.join('.'),
                length: value.length,
                prefix: value.slice(0, 48)
            });
        }

        const libraryMatches = value.match(LIBRARY_URL_RE) || [];
        for (const match of libraryMatches) {
            findings.push({
                type: 'library-url',
                path: trail.join('.'),
                raw: match,
                normalizedPath: normalizeUrlPath(match)
            });
        }

        const legacyMatches = value.match(LEGACY_ASSET_URL_RE) || [];
        for (const match of legacyMatches) {
            findings.push({
                type: 'legacy-asset-url',
                path: trail.join('.'),
                raw: match,
                normalizedPath: normalizeUrlPath(match)
            });
        }
        return findings;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => collectStringFindings(item, [...trail, String(index)], findings));
        return findings;
    }

    if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            collectStringFindings(item, [...trail, key], findings);
        }
    }

    return findings;
}

function resolveLibraryPath(libraryPath) {
    if (!libraryPath?.startsWith('/library/')) return null;

    const relative = libraryPath.replace(/^\/library\//, '');
    const resolved = path.resolve(LIBRARY_DIR, relative);
    const libraryRoot = path.resolve(LIBRARY_DIR);
    if (resolved !== libraryRoot && !resolved.startsWith(libraryRoot + path.sep)) {
        return null;
    }
    return resolved;
}

function summarizeFile(entry) {
    return {
        path: relativeFromProject(entry.filePath),
        scope: entry.scope,
        owner: entry.owner,
        id: entry.id || null,
        title: entry.title || null,
        nodeCount: entry.nodeCount || 0,
        updatedAt: entry.updatedAt || null
    };
}

function createReport() {
    return {
        generatedAt: new Date().toISOString(),
        libraryDir: LIBRARY_DIR,
        includePublic: INCLUDE_PUBLIC,
        summary: {
            filesScanned: 0,
            parsed: 0,
            byScope: {},
            byOwner: {},
            errors: 0,
            warnings: 0,
            info: 0
        },
        files: [],
        issues: []
    };
}

function addIssue(report, severity, code, message, details = {}) {
    report.issues.push({ severity, code, message, ...details });
    if (severity === 'error') report.summary.errors += 1;
    else if (severity === 'warn') report.summary.warnings += 1;
    else report.summary.info += 1;
}

function validateWorkflowFile(report, entry) {
    const fileStem = path.basename(entry.filePath, '.json');
    let raw;
    try {
        raw = fs.readFileSync(entry.filePath, 'utf8');
    } catch (error) {
        addIssue(report, 'error', 'READ_FAILED', `Could not read workflow file: ${error.message}`, {
            file: relativeFromProject(entry.filePath)
        });
        return { ...entry, fileStem, parsed: false };
    }

    const enriched = {
        ...entry,
        fileStem,
        rawHash: sha256(raw),
        sizeBytes: Buffer.byteLength(raw),
        parsed: false
    };

    try {
        enriched.workflow = JSON.parse(raw);
        enriched.parsed = true;
        report.summary.parsed += 1;
    } catch (error) {
        addIssue(report, 'error', 'INVALID_JSON', `Invalid workflow JSON: ${error.message}`, {
            file: relativeFromProject(entry.filePath)
        });
        return enriched;
    }

    if (!enriched.workflow || typeof enriched.workflow !== 'object' || Array.isArray(enriched.workflow)) {
        addIssue(report, 'error', 'INVALID_WORKFLOW_SHAPE', 'Workflow JSON must be an object.', {
            file: relativeFromProject(entry.filePath)
        });
        return enriched;
    }

    enriched.id = typeof enriched.workflow.id === 'string' ? enriched.workflow.id : null;
    enriched.title = typeof enriched.workflow.title === 'string' ? enriched.workflow.title : null;
    enriched.nodeCount = Array.isArray(enriched.workflow.nodes) ? enriched.workflow.nodes.length : 0;
    enriched.updatedAt = enriched.workflow.updatedAt || null;
    enriched.createdAt = enriched.workflow.createdAt || null;
    enriched.fingerprint = getWorkflowFingerprint(enriched.workflow);
    enriched.stringFindings = collectStringFindings(enriched.workflow);

    if (!enriched.id) {
        const severity = entry.scope === 'public' ? 'warn' : 'error';
        addIssue(report, severity, 'MISSING_WORKFLOW_ID', 'Workflow is missing a string id.', {
            file: relativeFromProject(entry.filePath),
            scope: entry.scope,
            owner: entry.owner
        });
    } else {
        if (enriched.id !== fileStem) {
            addIssue(report, entry.scope === 'public' ? 'info' : 'warn', 'FILENAME_ID_MISMATCH', 'Workflow filename does not match workflow.id.', {
                file: relativeFromProject(entry.filePath),
                filenameId: fileStem,
                workflowId: enriched.id,
                scope: entry.scope,
                owner: entry.owner
            });
        }

        if (!SAFE_FILE_ID_RE.test(enriched.id) || enriched.id.includes('..') || path.isAbsolute(enriched.id)) {
            addIssue(report, entry.scope === 'public' ? 'warn' : 'error', 'UNSAFE_WORKFLOW_ID', 'workflow.id is not safe to use as a filename.', {
                file: relativeFromProject(entry.filePath),
                workflowId: enriched.id,
                scope: entry.scope,
                owner: entry.owner
            });
        }
    }

    if (entry.scope === 'unexpected') {
        addIssue(report, 'warn', 'UNEXPECTED_WORKFLOW_LOCATION', 'Workflow JSON is under a workflows directory but not in an expected root.', {
            file: relativeFromProject(entry.filePath),
            location: entry.location
        });
    }

    if (entry.scope === 'legacy') {
        addIssue(report, 'warn', 'LEGACY_ROOT_WORKFLOW', 'Workflow lives in shared library/workflows instead of a user-isolated workflow directory.', {
            file: relativeFromProject(entry.filePath),
            workflowId: enriched.id,
            title: enriched.title
        });
    }

    const dataUrls = enriched.stringFindings.filter(item => item.type === 'data-url');
    if (dataUrls.length > 0) {
        addIssue(report, 'warn', 'EMBEDDED_BASE64_MEDIA', 'Workflow still contains embedded base64 media strings.', {
            file: relativeFromProject(entry.filePath),
            count: dataUrls.length,
            examples: dataUrls.slice(0, 5)
        });
    }

    validateWorkflowReferences(report, enriched);
    return enriched;
}

function validateWorkflowReferences(report, entry) {
    const libraryRefs = entry.stringFindings.filter(item => item.type === 'library-url');
    const legacyAssetRefs = entry.stringFindings.filter(item => item.type === 'legacy-asset-url');

    for (const ref of legacyAssetRefs) {
        addIssue(report, 'warn', 'OLD_ASSET_URL_REFERENCE', 'Workflow references old /assets/images or /assets/videos URL format.', {
            file: relativeFromProject(entry.filePath),
            owner: entry.owner,
            path: ref.path,
            url: ref.raw
        });
    }

    for (const ref of libraryRefs) {
        if (!ref.normalizedPath || !ref.normalizedPath.startsWith('/library/')) {
            addIssue(report, 'warn', 'MALFORMED_LIBRARY_REFERENCE', 'Workflow contains a malformed /library reference.', {
                file: relativeFromProject(entry.filePath),
                owner: entry.owner,
                path: ref.path,
                url: ref.raw
            });
            continue;
        }

        const parts = ref.normalizedPath.replace(/^\/library\//, '').split('/').filter(Boolean);
        if (parts[0] === 'users') {
            const referencedUser = parts[1];
            if (!referencedUser) {
                addIssue(report, 'warn', 'MALFORMED_USER_LIBRARY_REFERENCE', 'Workflow references /library/users without a username.', {
                    file: relativeFromProject(entry.filePath),
                    owner: entry.owner,
                    path: ref.path,
                    url: ref.raw
                });
                continue;
            }

            if (entry.scope === 'user' && referencedUser !== entry.owner) {
                addIssue(report, 'error', 'CROSS_USER_LIBRARY_REFERENCE', 'User workflow references another user library path.', {
                    file: relativeFromProject(entry.filePath),
                    owner: entry.owner,
                    referencedUser,
                    path: ref.path,
                    url: ref.raw
                });
            } else if (entry.scope === 'public') {
                addIssue(report, 'warn', 'PUBLIC_REFERENCES_USER_LIBRARY', 'Public workflow references a private user library path.', {
                    file: relativeFromProject(entry.filePath),
                    referencedUser,
                    path: ref.path,
                    url: ref.raw
                });
            }

            const resolved = resolveLibraryPath(ref.normalizedPath);
            if (!resolved || !fs.existsSync(resolved)) {
                addIssue(report, 'warn', 'MISSING_LIBRARY_REFERENCE', 'Referenced library file does not exist.', {
                    file: relativeFromProject(entry.filePath),
                    owner: entry.owner,
                    path: ref.path,
                    url: ref.raw,
                    expectedPath: resolved ? relativeFromProject(resolved) : null
                });
            }
            continue;
        }

        if (['images', 'videos', 'assets', 'workflows', 'chats'].includes(parts[0])) {
            const allowedLegacy = entry.scope === 'legacy' || (entry.scope === 'user' && LEGACY_ROOT_USERNAMES.has(entry.owner));
            if (!allowedLegacy) {
                addIssue(report, 'warn', 'LEGACY_LIBRARY_REFERENCE', 'Workflow references the shared legacy library root instead of a user library path.', {
                    file: relativeFromProject(entry.filePath),
                    owner: entry.owner,
                    path: ref.path,
                    url: ref.raw
                });
            }

            const resolved = resolveLibraryPath(ref.normalizedPath);
            if (!resolved || !fs.existsSync(resolved)) {
                addIssue(report, 'warn', 'MISSING_LIBRARY_REFERENCE', 'Referenced legacy library file does not exist.', {
                    file: relativeFromProject(entry.filePath),
                    owner: entry.owner,
                    path: ref.path,
                    url: ref.raw,
                    expectedPath: resolved ? relativeFromProject(resolved) : null
                });
            }
            continue;
        }

        addIssue(report, 'warn', 'UNKNOWN_LIBRARY_REFERENCE', 'Workflow references an unknown /library path shape.', {
            file: relativeFromProject(entry.filePath),
            owner: entry.owner,
            path: ref.path,
            url: ref.raw
        });
    }
}

function addGroupedIssue(report, severity, code, message, groupEntries, extra = {}) {
    addIssue(report, severity, code, message, {
        ...extra,
        files: groupEntries.map(summarizeFile)
    });
}

function groupBy(entries, getKey) {
    const groups = new Map();
    for (const entry of entries) {
        const key = getKey(entry);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    }
    return groups;
}

function analyzeGroups(report, entries) {
    const parsed = entries.filter(entry => entry.parsed);
    const duplicateIdGroups = groupBy(parsed, entry => entry.id);
    for (const [workflowId, groupEntries] of duplicateIdGroups) {
        if (groupEntries.length <= 1) continue;
        const nonPublicCount = groupEntries.filter(entry => entry.scope !== 'public').length;
        addGroupedIssue(
            report,
            nonPublicCount > 1 ? 'error' : 'warn',
            'DUPLICATE_WORKFLOW_ID',
            `workflow.id appears in ${groupEntries.length} workflow files.`,
            groupEntries,
            { workflowId }
        );
    }

    const exactHashGroups = groupBy(parsed, entry => entry.rawHash);
    for (const [rawHash, groupEntries] of exactHashGroups) {
        if (groupEntries.length <= 1) continue;
        addGroupedIssue(
            report,
            'warn',
            'EXACT_DUPLICATE_WORKFLOW_FILE',
            `Exact same workflow JSON content appears in ${groupEntries.length} files.`,
            groupEntries,
            { rawHash }
        );
    }

    const fingerprintGroups = groupBy(parsed, entry => entry.fingerprint);
    for (const [fingerprint, groupEntries] of fingerprintGroups) {
        if (groupEntries.length <= 1) continue;
        const rawHashes = new Set(groupEntries.map(entry => entry.rawHash));
        if (rawHashes.size <= 1) continue;
        addGroupedIssue(
            report,
            'warn',
            'POSSIBLE_COPIED_WORKFLOW',
            `Workflow structure is the same in ${groupEntries.length} files after ignoring top-level id/timestamps.`,
            groupEntries,
            { fingerprint }
        );
    }
}

function buildAuditReport() {
    const report = createReport();
    const discovered = discoverWorkflowFiles();
    report.summary.filesScanned = discovered.length;

    const analyzed = discovered.map(entry => {
        report.summary.byScope[entry.scope] = (report.summary.byScope[entry.scope] || 0) + 1;
        report.summary.byOwner[entry.ownerKey] = (report.summary.byOwner[entry.ownerKey] || 0) + 1;
        return validateWorkflowFile(report, entry);
    });

    analyzeGroups(report, analyzed);
    report.files = analyzed.map(entry => ({
        path: relativeFromProject(entry.filePath),
        scope: entry.scope,
        owner: entry.owner,
        id: entry.id || null,
        filenameId: entry.fileStem || null,
        title: entry.title || null,
        nodeCount: entry.nodeCount || 0,
        parsed: entry.parsed,
        sizeBytes: entry.sizeBytes || 0,
        createdAt: entry.createdAt || null,
        updatedAt: entry.updatedAt || null,
        rawHash: entry.rawHash || null,
        fingerprint: entry.fingerprint || null
    }));

    return report;
}

function printHumanReport(report) {
    console.log('MYML workflow audit');
    console.log(`Library: ${report.libraryDir}`);
    console.log(`Scanned: ${report.summary.filesScanned} workflow JSON file(s), parsed: ${report.summary.parsed}`);
    console.log(`Scopes: ${Object.entries(report.summary.byScope).map(([scope, count]) => `${scope}=${count}`).join(', ') || 'none'}`);
    console.log(`Issues: errors=${report.summary.errors}, warnings=${report.summary.warnings}, info=${report.summary.info}`);

    if (Object.keys(report.summary.byOwner).length > 0) {
        console.log('\nBy owner:');
        for (const [owner, count] of Object.entries(report.summary.byOwner).sort(([a], [b]) => a.localeCompare(b))) {
            console.log(`  - ${owner}: ${count}`);
        }
    }

    if (report.issues.length === 0) {
        console.log('\nNo workflow isolation or copy-drift issues found.');
        return;
    }

    console.log('\nIssues:');
    for (const issue of report.issues) {
        console.log(`\n[${issue.severity.toUpperCase()}] ${issue.code}`);
        console.log(`  ${issue.message}`);

        if (issue.file) {
            console.log(`  file: ${issue.file}`);
        }
        if (issue.owner) {
            console.log(`  owner: ${issue.owner}`);
        }
        if (issue.workflowId) {
            console.log(`  workflowId: ${issue.workflowId}`);
        }
        if (issue.url) {
            console.log(`  url: ${issue.url}`);
        }
        if (issue.path) {
            console.log(`  jsonPath: ${issue.path}`);
        }
        if (issue.expectedPath) {
            console.log(`  expectedPath: ${issue.expectedPath}`);
        }
        if (Array.isArray(issue.files)) {
            for (const file of issue.files) {
                console.log(`  - ${file.scope}/${file.owner}: ${file.path} id=${file.id || 'null'} title=${file.title || 'Untitled'}`);
            }
        }
        if (Array.isArray(issue.examples)) {
            for (const example of issue.examples) {
                console.log(`  - ${example.path || '(root)'} ${example.prefix || ''} length=${example.length || 0}`);
            }
        }
    }
}

const report = buildAuditReport();

if (OUTPUT_JSON) {
    console.log(JSON.stringify(report, null, 2));
} else {
    printHumanReport(report);
}

if (STRICT && (report.summary.errors > 0 || report.summary.warnings > 0)) {
    process.exit(1);
}
