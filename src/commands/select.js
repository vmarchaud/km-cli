
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

module.exports = class StatusCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('select', 'select a server for future actions')
      .argument('<bucket>', 'the selected bucket')
      .complete(() => {
        return new Promise((resolve, reject) => {
          this.km.bucket.retrieveAll().then(res => {
            let buckets = res.data
            return resolve(buckets.map(bucket => bucket.name))
          }).catch(reject)
        })
      })
      .action(this.launch.bind(this))
    return this.cli
  }

  launch (args, opts) {
    let bucketName = args.bucket
    this.km.bucket.retrieveAll()
      .then(res => {
        let buckets = res.data
        let bucket = buckets.find(bucket => bucket.name === bucketName)
        if (!bucket) {
          throw new Error(`Cant find bucket ${bucketName} that you are tried to select`)
        }
        let settingsPath = path.resolve(os.homedir(), '.keymetrics-settings')
        let settings = JSON.parse(fs.readFileSync(settingsPath).toString())
        settings.bucket = bucket._id.toString()
        fs.writeFileSync(settingsPath, JSON.stringify(settings))
        console.log(`Succesfully selected bucket ${bucketName} as default bucket`)
      })
      .catch(res => {
        console.error(res)
      })
  }
}
