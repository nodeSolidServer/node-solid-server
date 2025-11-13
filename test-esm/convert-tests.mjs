#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import globPkg from 'glob'
const { glob } = globPkg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')
const originalTestDir = path.join(projectRoot, 'test')
const esmTestDir = path.join(projectRoot, 'test-esm')

// Conversion patterns for CommonJS to ESM
const conversionPatterns = [
  // Basic require statements
  {
    pattern: /const\s+(\w+)\s*=\s*require\((['"`])(.*?)\2\)/g,
    replacement: "import $1 from '$3'"
  },
  {
    pattern: /const\s*\{\s*([^}]+)\s*\}\s*=\s*require\((['"`])(.*?)\2\)/g,
    replacement: "import { $1 } from '$3'"
  },
  // module.exports to export
  {
    pattern: /module\.exports\s*=\s*/g,
    replacement: 'export default '
  },
  {
    pattern: /exports\.(\w+)\s*=\s*/g,
    replacement: 'export const $1 = '
  },
  // Add use strict removal
  {
    pattern: /['"]use strict['"];\s*\n?/g,
    replacement: ''
  },
  // Update relative require paths to .mjs
  {
    pattern: /(import.*from\s+['"`])(\.\.?\/[^'"`]*?)(['"`])/g,
    replacement: (match, prefix, path, suffix) => {
      if (!path.includes('.')) {
        return match // Keep as is if no extension
      }
      const newPath = path.replace(/\.js$/, '.mjs')
      return prefix + newPath + suffix
    }
  }
]

function convertFileContent(content, fileName) {
  let converted = content
  
  // Apply conversion patterns
  conversionPatterns.forEach(({ pattern, replacement }) => {
    if (typeof replacement === 'function') {
      converted = converted.replace(pattern, replacement)
    } else {
      converted = converted.replace(pattern, replacement)
    }
  })
  
  // Add ESM specific imports at the top
  const esmImports = [
    "import { describe, it, beforeEach, afterEach, before, after } from 'mocha'",
    "import { fileURLToPath } from 'url'",
    "import path from 'path'",
    "import { createRequire } from 'module'",
    "",
    "const require = createRequire(import.meta.url)",
    "const __filename = fileURLToPath(import.meta.url)",
    "const __dirname = path.dirname(__filename)",
    ""
  ]
  
  // Only add if not already present
  if (!converted.includes('import.meta.url')) {
    converted = esmImports.join('\n') + '\n' + converted
  }
  
  return converted
}

async function convertTestFile(sourceFile, targetFile) {
  try {
    const content = await fs.readFile(sourceFile, 'utf8')
    const convertedContent = convertFileContent(content, path.basename(sourceFile))
    
    // Ensure target directory exists
    await fs.ensureDir(path.dirname(targetFile))
    
    // Write converted file
    await fs.writeFile(targetFile, convertedContent, 'utf8')
    
    console.log(`✓ Converted: ${path.relative(projectRoot, sourceFile)} → ${path.relative(projectRoot, targetFile)}`)
    
    return true
  } catch (error) {
    console.error(`✗ Error converting ${sourceFile}:`, error.message)
    return false
  }
}

async function convertAllTests() {
  console.log('Converting CommonJS tests to ESM...\n')
  
  // Find all .js test files
  const testFiles = await glob('**/*.js', { cwd: originalTestDir, nodir: true })
  
  let successCount = 0
  let failCount = 0
  
  for (const testFile of testFiles) {
    const sourceFile = path.join(originalTestDir, testFile)
    const targetFile = path.join(esmTestDir, testFile.replace(/\.js$/, '.mjs'))
    
    const success = await convertTestFile(sourceFile, targetFile)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }
  
  console.log(`\nConversion complete!`)
  console.log(`✓ Successful: ${successCount}`)
  console.log(`✗ Failed: ${failCount}`)
  
  if (failCount > 0) {
    console.log('\nNote: Some files may require manual review and adjustment.')
  }
  
  return { successCount, failCount }
}

// Run if called directly
if (process.argv[1] === __filename) {
  convertAllTests()
    .then(({ successCount, failCount }) => {
      process.exit(failCount > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('Conversion failed:', error)
      process.exit(1)
    })
}

export default convertAllTests