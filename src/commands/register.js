
'use strict'

const LoginCommand = require('./login')

module.exports = class StatusCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli
    this.strategy = opts.strategy

    let launch = LoginCommand.prototype.launch

    // register the command
    this.cli
      .command('register', 'register to our service')
      .action(launch.bind(this))
    return this.cli
  }
}
