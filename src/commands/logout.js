
'use strict'

module.exports = class StatusCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('logout', 'logout from your account')
      .action(this.launch.bind(this))
    return this.cli
  }

  launch (args, opts) {
    this.km.auth.logout()
      .then(res => {
        console.log(`- Logout successful`)
      })
  }
}
