#!env node

'use strict'

const Keymetrics = require('kmjs-core')
const fs = require('fs')
const async = require('async')
const path = require('path')
const os = require('os')
const pkg = require('../package.json')
const CustomStrategy = require('../src/custom_auth')
let commands = require('../src/commands.json')
let prog = require('caporal')

const strategy = new CustomStrategy({
  client_id: '7412235273'
})
const km = new Keymetrics({
  OAUTH_CLIENT_ID: '7412235273'
}).use(strategy)

let settings = {}
const cliName = process.argv[1].split('/').pop().split('.')[0]

prog
  .version(pkg.version)
  .description(pkg.description)

async.series([
  // if the command need to be made while been authenticated and the user isnt
  // we should tell him to register himself
  next => {
    let targetCommand = commands.find(command => command.name === process.argv[2])
    if (!targetCommand) return next()

    strategy.isAuthenticated()
      .then(authenticated => {
        if (targetCommand.authenticated && !authenticated) {
          // in this case we want to show a helpful message
          console.log(`
    To use this command line, you first need to register/login on pm2.io :
      
        ${cliName} register
          <or>
        ${cliName} login

    Thanks`)
          return process.exit(0)
        }
        // otherwise continue
        return next()
      }).catch(err => console.error(`Unexpected error : \n ${err.message}`))
  },
  // parse the settings
  next => {
    let settingsPath = path.resolve(os.homedir(), '.keymetrics-settings')
    fs.access(settingsPath, fs.R_OK || fs.constants.R_OK, (err) => {
      if (!err) {
        // if we can read it
        settings = JSON.parse(fs.readFileSync(settingsPath).toString())
        return next()
      } else {
        // otherwise create it
        return fs.writeFile(settingsPath, '{}', next)
      }
    })
  },
  // register commands
  next => {
    // if we use a specific command, do not load other commands
    let targetCommand = commands.find(command => command.name === process.argv[2])
    if (targetCommand) {
      commands = [ targetCommand ]
    }

    const load = _ => {
      async.each(commands, (command, _next) => {
        let Command = require(command.path)
        prog = new Command(Object.assign(settings, {
          km, cli: prog, strategy
        }))
        return _next()
      }, next)
    }

    // authenticate only if needed
    if (targetCommand && targetCommand.authenticated) {
      strategy._retrieveTokens(_ => {
        // if the user already selected bucket, continue
        if (settings.bucket) return load()
        // otherwise fetch them to make a choice for him
        km.bucket.retrieveAll()
          .then(res => {
            const buckets = res.data

            // auto select it if we have only one bucket
            if (buckets.length === 1) {
              settings.bucket = buckets[0].id
            } else if (targetCommand.name !== 'select') {
              // otherwise tell him to select one
              console.log(`You shoud select the bucket you want to inspect with "${cliName} select <bucket_name>" or using the "--bucket <id>" flag`)
            }
            return load()
          }).catch(ignoredErr => load())
      })
    } else {
      // otherwise load the command and run it
      load()
    }
  }
], (err) => {
  if (err) {
    console.error(err)
    return process.exit(-1)
  }

  // parse args and dispatch
  return prog.parse(process.argv)
})
