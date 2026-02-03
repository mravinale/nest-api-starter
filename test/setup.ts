import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test for all tests (uses project root)
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
