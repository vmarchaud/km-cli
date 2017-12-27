
'use strict'

const Table = require('tty-table')
const chalk = require('chalk')
const moment = require('moment')
const utils = require('../utils')

const headers = [
  {
    value: 'Process Name',
    width: 30
  },
  {
    value: 'Server Name'
  },
  {
    value: 'Status',
    formatter: value => {
      if (value === 'online') {
        return chalk.green(value)
      } else if (value === 'offline') {
        return chalk.red(value)
      } else {
        return chalk.blue(value)
      }
    },
    width: 12
  },
  {
    value: 'Mode',
    width: 12
  },
  {
    value: 'CPU',
    width: 10
  },
  {
    value: 'Memory',
    width: 10
  }
]

module.exports = class StatusCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('status', 'get remote status')
      .option('-a --apps', 'Only get status from these apps', utils.validateAppServerFilter, null, false)
      .option('-s --servers', 'Only get status from these servers', utils.validateAppServerFilter, null, false)
      .option('-b --bucket <id>', 'Id of the bucket you want to use', null, opts.bucket, true)
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
    let start = Date.now()
    this.km.data.status.retrieve(opts.bucket)
      .then(res => {
        console.log(`- Retrieved from API in ${Date.now() - start} ms`)
        start = Date.now()

        let servers = res.data

        let avgOld = servers
          .map(server => moment().diff(moment(server.updated_at)))
          .reduce((total, val) => total + val, 0)
        avgOld = avgOld / servers.length
        console.log(`- Computed on ${Math.floor(avgOld)} ms old data`)

        let rows = []
        servers.forEach(server => {
          // in case the filter is an array, full text match
          if (typeof opts.servers === 'object' &&
            !opts.servers.includes(server.server_name)) {
            return
          }
          // in case of the regex, match the server name against it
          if (utils.isRegex(opts.servers) &&
            server.server_name.match(new RegExp(utils.cleanRegex(opts.servers))) === null) {
            return
          }

          server.data.process.forEach(process => {
            // in case the filter is an array, full text match
            if (typeof opts.apps === 'object' &&
            !opts.apps.includes(process.name)) {
              return
            }
            // in case of the regex, match the server name against it
            if (utils.isRegex(opts.apps) &&
              process.name.match(new RegExp(utils.cleanRegex(opts.apps))) === null) {
              return
            }

            rows.push([
              process.name,
              server.server_name,
              process.status,
              process.exec_mode.replace('_mode', ''),
              process.cpu + '%',
              utils.humanizeBytes(process.memory)
            ])
          })
        })
        var t1 = Table(headers, rows)
        console.log(t1.render())
        console.log(`- Rendered in ${Date.now() - start} ms`)
      })
      .catch(error => {
        console.error(`Error while retrieving status :`)
        console.error(error.stack)
      })
  }
}
