import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_VARIABLES = [
    'HERMES_CLIENT_MODE',
    'HERMES_BASE_URL',
    'HERMES_API_KEY',
    'HERMES_MODEL',
    'HERMES_TIMEOUT_MS',
    'AGENT_TEXT_PROVIDER',
    'AGENT_TEXT_BASE_URL',
    'AGENT_TEXT_API_KEY',
    'AGENT_TEXT_MODEL',
    'AGENT_TEXT_TIMEOUT_MS',
    'DATABASE_URL',
];

const SENSITIVE_NAME_PATTERN = /(key|password|token|url)/i;

function isPresent(value) {
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

function displayValue(name, value) {
    if (!isPresent(value)) return 'missing';
    if (SENSITIVE_NAME_PATTERN.test(name)) return 'present (<redacted>)';
    return 'present';
}

console.log('[HermesEnv] Checking MYML Canvas Hermes migration environment...');

const missing = [];

for (const name of REQUIRED_VARIABLES) {
    const value = process.env[name];
    const present = isPresent(value);
    if (!present) missing.push(name);
    console.log(`${present ? '✓' : '✗'} ${name}: ${displayValue(name, value)}`);
}

if (missing.length > 0) {
    console.log('');
    console.log(`[HermesEnv] Missing required variable(s): ${missing.join(', ')}`);
    console.log('[HermesEnv] No external service was contacted and no database write was attempted.');
    process.exitCode = 1;
} else {
    console.log('');
    console.log('[HermesEnv] All required variables are present. Values were not printed.');
}

