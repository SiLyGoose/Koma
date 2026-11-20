import 'dotenv/config';
export function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable ${name}. Add it to your .env file.`);
    }
    return value;
}
export function optionalEnv(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
//# sourceMappingURL=env.js.map