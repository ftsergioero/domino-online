// Carga backend/.env si existe (Node >= 21.7). Debe importarse antes que nada.
import { existsSync } from 'fs';
import { join } from 'path';

const file = join(__dirname, '..', '.env');
if (existsSync(file)) process.loadEnvFile(file);
