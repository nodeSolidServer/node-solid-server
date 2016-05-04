const inquirer = require('inquirer')
const fs = require('fs')
const options = require('./options')
const camelize = require('camelize')

var questions = options
  .map((option) => {
    if (!option.type) {
      if (option.flag) {
        option.type = 'confirm'
      } else {
        option.type = 'input'
      }
    }

    option.message = option.question || option.help
    return option
  })

module.exports = function (program) {
  program
    .command('init')
    .option('--advanced', 'Ask for all the settings')
    .description('create solid server configurations')
    .action((opts) => {
      // Filter out advanced commands
      if (!opts.advanced) {
        questions = questions.filter((option) => option.prompt)
      }

      // Prompt to the user
      inquirer.prompt(questions)
        .then((answers) => {
          // clean answers
          Object.keys(answers).forEach((answer) => {
            if (answer.startsWith('use')) {
              delete answers[answer]
            }
          })

          // write config file
          var config = JSON.stringify(camelize(answers), null, '  ')
          var configPath = process.cwd() + '/config.json'

          fs.writeFile(configPath, config, (err) => {
            if (err) {
              return console.log('failed to write config.json')
            }
            console.log('config created on', configPath)
          })
        })
        .catch((err) => {
          console.log('Error:', err)
        })
    })
}
