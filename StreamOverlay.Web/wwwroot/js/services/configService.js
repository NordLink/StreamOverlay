export class ConfigService {

    async getConfig({ cache = 'no-store' } = {}) {
        const res = await fetch(`/api/config`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache
        });
        if (!res.ok) {
            throw new Error(`Config load failed: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    }
   
    async getConfigSafe(fallback = {}, options) {
        try {
            return await this.getConfig(options);
        } catch (e) {
            console.error('ConfigService.getConfigSafe:', e);
            return fallback;
        }
    }
}