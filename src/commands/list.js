
const utils = require('../utils')
const Table = require('tty-table')

const SUB_COMMANDS = [ 'metrics', 'actions' ]
const getHeaders = (name) => {
  return [
    {
      value: name,
      width: 20
    },
    {
      value: 'Servers',
      width: 40
    },
    {
      value: 'Apps',
      width: 40
    }
  ]
}

module.exports = class StatsCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('list', 'list metrics or actions possible for processes')
      .argument('<subcommand>', `either  ${SUB_COMMANDS.join(' or ')}`, (val) => {
        if (SUB_COMMANDS.includes(val)) return val
        // if the value isn't in the array, throw an error
        throw new Error(`The subcommand must be either ${SUB_COMMANDS.join(' or ')}`)
      })
      .option('-b --bucket <id>', 'Id of the bucket you want to use', null, opts.bucket, true)
      .complete(() => {
        return new Promise((resolve, reject) => {
          this.km.bucket.retrieveAll().then(res => {
            let buckets = res.data
            return resolve(buckets.map(bucket => bucket._id))
          }).catch(reject)
        })
      })
      .option('-a --apps', 'Only get stats from these apps', utils.validateAppServerFilter, null, false)
      .option('-s --servers', 'Only get stats from these servers', utils.validateAppServerFilter, null, false)
      .action(this.launch.bind(this))
    return this.cli
  }

  launch (args, opts) {
    // we need to build array of apps and servers where the metric is
    switch (args.subcommand) {
      case 'metrics': {
        this.km.data.status.retrieve(opts.bucket).then(res => {
          let metrics = new Map()
          // build a map where each metrics has its apps and servers
          res.data.forEach(server => {
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

              Object.keys(process.axm_monitor).forEach(metricName => {
                let metric = metrics.get(metricName) || {}

                if (!metric.apps) metric.apps = new Set()
                if (!metric.servers) metric.servers = new Set()

                metric.apps.add(process.name)
                metric.servers.add(server.server_name)
                metrics.set(metricName, metric)
              })
            })
          })
          let rows = []
          let headers = getHeaders('Metric name')
          // build the rows
          for (let [metric, opts] of metrics) {
            rows.push([
              metric,
              Array.from(opts.servers).join(', '),
              Array.from(opts.apps).join(', ')
            ])
          }
          var t1 = Table(headers, rows)
          // render it
          console.log(t1.render())
        }).catch(utils.errorHandler)
        break
      }
      case 'actions': {
        this.km.data.status.retrieve(opts.bucket).then(res => {
          let actions = new Map()
          // build a map where each metrics has its apps and servers
          res.data.forEach(server => {
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

              process.axm_actions
                .map(action => action.action_name)
                .forEach(actionName => {
                  let action = actions.get(actionName) || {}

                  if (!action.apps) action.apps = new Set()
                  if (!action.servers) action.servers = new Set()

                  action.apps.add(process.name)
                  action.servers.add(server.server_name)
                  actions.set(actionName, action)
                })
            })
          })
          let rows = []
          let headers = getHeaders('Action name')
          // build the rows
          for (let [action, opts] of actions) {
            rows.push([
              action,
              Array.from(opts.servers).join(', '),
              Array.from(opts.apps).join(', ')
            ])
          }
          var t1 = Table(headers, rows)
          // render it
          console.log(t1.render())
        }).catch(utils.errorHandler)
      }
    }
  }
}
