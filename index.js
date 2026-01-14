const GAME_NAME = 'Escape From Tarkov: SPT'
const GAME_ID = 'eftsptaki';
const DLL_FILE_EXT = '.dll'

const path = require('path');
const { fs, log, util } = require('vortex-api');

function main(context) {

    context.requireExtension('modtype-bepinex');
    
    context.registerGame({
        id: GAME_ID,
        name: GAME_NAME,
        mergeMods: true,
        supportedTools: [],
        queryModPath: () => '',
        logo: 'gameart.jpg',
        executable: () => {
            return process.platform === 'win32'
            ? 'SPT.Server.cmd'
            : 'SPT.Server.sh';
        },
        requiredFiles: [
            'EscapeFromTarkov.exe',
        ],
        setup: prepareForModding,
        environment: {},
        details: {},
    });
}

async function prepareForModding(discovery) {
    const sptDir = discovery.path;

    const win_target = path.join(sptDir, 'SPT.Server.cmd');
    await fs.copyAsync(
        path.join(__dirname, 'wrappers', 'spt-server.cmd'),
        win_target,
        { overwrite: true }
    );

    const linux_target = path.join(sptDir, 'SPT.Server.sh');
    await fs.copyAsync(
      path.join(__dirname, 'wrappers', 'spt-server.sh'),
      linux_target,
      { overwrite: true }
    );
    await fs.chmodAsync(linux_target, 0o755);

    return await fs.ensureDirWritableAsync(path.join(discovery.path, 'BepInEx'));
}

module.exports = {
    default: main,
};
