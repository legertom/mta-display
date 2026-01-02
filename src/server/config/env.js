const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    BUS_TIME_API_KEY: z.string().min(1, "BUS_TIME_API_KEY is required in .env"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
}

module.exports = parsed.data;
