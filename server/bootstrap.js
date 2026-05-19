import dotenv from 'dotenv';

dotenv.config();
process.env.MYML_DOTENV_BOOTSTRAPPED = 'true';

await import('./index.js');
