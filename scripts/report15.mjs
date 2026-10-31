// report15.mjs —— 命令行入口
// 用法：node scripts/report15.mjs [--preview] [--send] [--force]
import { runReport } from '../lib/report-run.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);

await runReport({ preview: has('preview'), send: has('send'), force: has('force') });
