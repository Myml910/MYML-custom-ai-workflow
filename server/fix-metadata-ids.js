/**
 * fix-metadata-ids.js
 * 
 * This script fixes metadata files where the `id` field doesn't match the filename.
 * This is needed for the delete API to work correctly.
 * 
 * Run with: node server/fix-metadata-ids.js
 */

import fs from 'fs';
import path from 'path';
import { IMAGES_DIR, VIDEOS_DIR } from './config/paths.js';

function fixMetadataInDirectory(dir, type) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let fixed = 0;
    let alreadyCorrect = 0;

    for (const jsonFile of jsonFiles) {
        const filePath = path.join(dir, jsonFile);
        const expectedId = jsonFile.replace('.json', '');

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const metadata = JSON.parse(content);

            if (metadata.id !== expectedId) {
                console.log(`Fixing: ${jsonFile}`);
                console.log(`  Old id: ${metadata.id}`);
                console.log(`  New id: ${expectedId}`);

                metadata.id = expectedId;
                fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
                fixed++;
            } else {
                alreadyCorrect++;
            }
        } catch (e) {
            console.error(`Error processing ${jsonFile}:`, e.message);
        }
    }

    console.log(`\n${type}: Fixed ${fixed} files, ${alreadyCorrect} already correct`);
}

console.log('Fixing metadata IDs...\n');
console.log('=== Images ===');
fixMetadataInDirectory(IMAGES_DIR, 'Images');

console.log('\n=== Videos ===');
fixMetadataInDirectory(VIDEOS_DIR, 'Videos');

console.log('\nDone! You can now delete items from history.');
