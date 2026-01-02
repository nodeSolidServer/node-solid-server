import inquirer from 'inquirer'
import fs from 'fs'
import options from './options.mjs'
import camelize from 'camelize'

const questions = options
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

export default function (program) {
  program
    .command('init')
    .option('--advanced', 'Ask for all the settings')
    .description('create solid server configurations')
    .action((opts) => {
      // Filter out advanced commands
      let filtered = questions
      if (!opts.advanced) {
        filtered = filtered.filter((option) => option.prompt)
      }

      // Prompt to the user
      inquirer.prompt(filtered)
        .then((answers) => {
          manipulateEmailSection(answers)
          manipulateServerSection(answers)
          cleanupAnswers(answers)

          // write config file
          const config = JSON.stringify(camelize(answers), null, '  ')
          const configPath = process.cwd() + '/config.json'

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

function cleanupAnswers (answers) {
  Object.keys(answers).forEach((answer) => {
    if (answer.startsWith('use')) {
      delete answers[answer]
    }
  })
}

function manipulateEmailSection (answers) {
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
}

function manipulateServerSection (answers) {
  answers.server = {
    name: answers['server-info-name'],
    description: answers['server-info-description'],
    logo: answers['server-info-logo']
  }
  Object.keys(answers).forEach((answer) => {
    if (answer.startsWith('server-info-')) {
      delete answers[answer]
    }
  })
}
