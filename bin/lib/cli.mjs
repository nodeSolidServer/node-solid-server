import { Command } from 'commander';
import loadInit from './init.mjs';
import loadStart from './start.mjs';
import loadInvalidUsernames from './invalidUsernames.mjs';
import loadMigrateLegacyResources from './migrateLegacyResources.mjs';
import loadUpdateIndex from './updateIndex.mjs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function startCli(server) {
  const program = new Command();
  program.version(getVersion());
  loadInit(program);
  loadStart(program, server);
  loadInvalidUsernames(program);
  loadMigrateLegacyResources(program);
  loadUpdateIndex(program);
  program.parse(process.argv);
  if (program.args.length === 0) program.help();
}

function getVersion() {
  try {
    const options = { cwd: __dirname, encoding: 'utf8' };
    const { stdout } = spawnSync('git', ['describe', '--tags'], options);
    const { stdout: gitStatusStdout } = spawnSync('git', ['status'], options);
    const version = stdout.trim();
    if (version === '' || gitStatusStdout.match('Not currently on any branch')) {
      throw new Error('No git version here');
    }
    return version;
  } catch (e) {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version;
  }
}
