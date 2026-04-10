import fs from 'fs';
import path from 'path';

export function dumpDebug(data: any) {
    try {
        const p = path.resolve(process.cwd(), 'last_download_debug.json');
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
    } catch (e) {}
}
