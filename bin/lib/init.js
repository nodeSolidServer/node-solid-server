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
        // .then((answers) => {
        //   let store = new KVPFileStore()
        //   return store.createCollection('clients')
        //     .then(() => {
        //       return answers
        //     })
        // })
        .then((answers) => {
          // setting email
          if (answers.useEmail) {
            answers.email = {
              host: answers['email-host'],
              port: answers['email-port'],
              secure: true,
              auth: {
                user: answers['email-auth-user'],
                pass: answers['email-auth-pass']
              }
            }
            delete answers['email-host']
            delete answers['email-port']
            delete answers['email-auth-user']
            delete answers['email-auth-pass']
          }

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
