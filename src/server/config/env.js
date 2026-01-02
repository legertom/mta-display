const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    // Make API Key optional so the app doesn't crash on Vercel if missing
    BUS_TIME_API_KEY: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    // Don't exit, just warn. This allows the app to start even with issues.
    // process.exit(1); 
}

// Export parsed data or defaults if parsing failed (to prevent crash)
module.exports = parsed.success ? parsed.data : { PORT: 3001, BUS_TIME_API_KEY: '' };
