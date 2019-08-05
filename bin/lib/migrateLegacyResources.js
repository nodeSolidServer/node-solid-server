const fs = require('fs')
const Path = require('path')
const promisify = require('util').promisify
const readdir = promisify(fs.readdir)
const lstat = promisify(fs.lstat)
const rename = promisify(fs.rename)

/* Converts the old (pre-5.0.0) extensionless files to $-based files _with_ extensions
 * to make them work in the new resource mapper (post-5.0.0).
 * By default, all extensionless files (that used to be interpreted as Turtle) will now receive a '$.ttl' suffix. */
/* https://www.w3.org/DesignIssues/HTTPFilenameMapping.html */

module.exports = function (program) {
  program
    .command('migrate-legacy-resources')
    .option('-p, --path <path>', 'Path to the data folder, defaults to \'data/\'')
    .option('-s, --suffix <path>', 'The suffix to add to extensionless files, defaults to \'$.ttl\'')
    .option('-v, --verbose', 'Path to the data folder')
    .description('Migrate the data folder from node-solid-server 4 to node-solid-server 5')
    .action(async (opts) => {
      const verbose = opts.verbose
      const suffix = opts.suffix || '$.ttl'
      let paths = opts.path ? [ opts.path ] : [ 'data', 'config/templates' ]
      paths = paths.map(path => path.startsWith(Path.sep) ? path : Path.join(process.cwd(), path))
      try {
        for (const path of paths) {
          if (verbose) {
            console.log(`Migrating files in ${path}`)
          }
          await migrate(path, suffix, verbose)
        }
      } catch (err) {
        console.error(err)
      }
    })
}

async function migrate (path, suffix, verbose) {
  const files = await readdir(path)
  for (const file of files) {
    const fullFilePath = Path.join(path, file)
    const stat = await lstat(fullFilePath)
    if (stat.isFile()) {
      if (shouldMigrateFile(file)) {
        const newFullFilePath = getNewFileName(fullFilePath, suffix)
        if (verbose) {
          console.log(`${fullFilePath}\n  => ${newFullFilePath}`)
        }
        await rename(fullFilePath, newFullFilePath)
      }
    } else {
      if (shouldMigrateFolder(file)) {
        await migrate(fullFilePath, suffix, verbose)
      }
    }
  }
}

function getNewFileName (fullFilePath, suffix) {
  return fullFilePath + suffix
}

function shouldMigrateFile (filename) {
  return filename.indexOf('.') < 0
}

function shouldMigrateFolder (foldername) {
  return foldername[0] !== '.'
}
