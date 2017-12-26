#!/usr/bin/env node

'use strict'

const Keymetrics = require('kmjs-core')
const fs = require('fs')
const async = require('async')
const path = require('path')
const os = require('os')
const pkg = require('../package.json')

const km = new Keymetrics({
  OAUTH_CLIENT_ID: '7412235273'
}).use('embed')

let commands = [
  {
    name: 'status',
    path: '../src/commands/status'
  },
  {
    name: 'select',
    path: '../src/commands/select'
  },
  {
    name: 'trigger',
    path: '../src/commands/trigger'
  },
  {
    name: 'stats',
    path: '../src/commands/stats'
  },
  {
    name: 'list',
    path: '../src/commands/list'
  }
]

let settings = {}
let prog = require('caporal')

setTimeout(() => {}, 1000)

prog
  .version(pkg.version)
  .description(pkg.description)

async.series([
  // parse the settings
  next => {
    let settingsPath = path.resolve(os.homedir(), '.keymetrics-settings')
    fs.access(settingsPath, fs.constants.R_OK | fs.constants.W_OK, (err) => {
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

    async.each(commands, (command, _next) => {
      let Command = require(command.path)
      prog = new Command(Object.assign(settings, {
        km, cli: prog
      }))
      return _next()
    }, next)
  }
], (err) => {
  if (err) {
    console.error(err)
    return process.exit(-1)
  }

  // parse args and dispatch
  return prog.parse(process.argv)
})
