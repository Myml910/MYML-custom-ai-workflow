import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const LIBRARY_DIR = process.env.LIBRARY_DIR || path.join(PROJECT_ROOT, 'library');
export const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
export const VIDEOS_DIR = path.join(LIBRARY_DIR, 'videos');
export const WORKFLOWS_DIR = path.join(LIBRARY_DIR, 'workflows');
export const CHATS_DIR = path.join(LIBRARY_DIR, 'chats');
export const ASSETS_DIR = path.join(LIBRARY_DIR, 'assets');
export const TEMP_DIR = path.join(LIBRARY_DIR, 'temp');
