
'use strict'

const utils = require('../utils')
const moment = require('moment')

const randomColor = () => {
  return [Math.random() * 255, Math.random() * 255, Math.random() * 255]
}

module.exports = class StatsCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('stats', 'retrieve multiple data from a metric')
      .argument('<metric>', 'name of the metric')
      .argument('<timerange>', 'maximum history to retrieve')
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
    const blessed = require('blessed')
    const contrib = require('blessed-contrib')

    // we need to build array of apps and servers where the metric is
    let apps = new Set()
    let servers = new Set()
    let metric = args.metric

    this.km.data.status.retrieve(opts.bucket).then(res => {
      res.data.forEach(server => {
        server.data.process.forEach(process => {
          let isMetricHere = Object.keys(process.axm_monitor).includes(metric)
          if (!isMetricHere) return
          apps.add(process.name)
          servers.add(server.server_name)
        })
      })
      apps = Array.from(apps)
      servers = Array.from(servers)

      let specificMetrics = ['cpu', 'memory']
      if (apps.length === 0 && servers.length === 0 &&
          !specificMetrics.includes(metric)) {
        return console.log(`- Found 0 apps with metric ${metric}`)
      }
      // then we need to filter them based on the filters
      // filter either by regex or full match
      if (utils.isRegex(opts.apps)) {
        apps = apps.filter(app => {
          return app.match(new RegExp(utils.cleanRegex(opts.apps)))
        })
      } else if (opts.apps) {
        apps = apps.filter(app => {
          return app === opts.apps
        })
      }
      // filter either by regex or full match
      if (utils.isRegex(opts.servers)) {
        servers = servers.filter(server => {
          return server.match(new RegExp(utils.cleanRegex(opts.servers)))
        })
      } else if (opts.servers instanceof Array) {
        servers = servers.filter(server => opts.servers.includes(server))
      }
      // request the aggregation
      this.km.data.metrics.retrieveAggregations(opts.bucket, {
        aggregations: [
          {
            name: metric,
            start: args.timerange,
            apps: Array.from(apps),
            servers: Array.from(servers),
            types: ['histogram', 'servers']
          }
        ]
      }).then(res => {
        let aggregation = res.data[0]
        let series = []
        // build series
        for (let server of aggregation.by_server.buckets) {
          series.push({
            title: server.key,
            x: server.histogram.buckets.map(point => {
              return moment(point.key_as_string).format('DD/MM HH') + 'h'
            }),
            y: server.histogram.buckets.map(point => {
              return point.stats.avg
            }),
            style: {
              line: randomColor()
            }
          })
        }
        // create the screen
        const screen = blessed.screen()

        // create the line
        var line = contrib.line({
          style:
          {
            text: 'green',
            baseline: 'black'
          },
          xLabelPadding: 3,
          xPadding: 5,
          showLegend: true,
          wholeNumbersOnly: false,
          label: `Aggregation of ${metric} over ${args.timerange}`
        })
        // add line to the screen
        screen.append(line)
        // add data into the line
        line.setData(series)

        screen.key(['escape', 'q', 'C-c'], () => process.exit(0))
        screen.render()
      }).catch(utils.errorHandler)
    }).catch(utils.errorHandler)
  }
}
