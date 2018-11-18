
const utils = require('../utils')
const moment = require('moment')

const SUB_COMMANDS = [ 'list', 'graph' ]

module.exports = class MetricsCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('metrics', 'list metrics or actions possible for processes')
      .argument('<subcommand>', `either  ${SUB_COMMANDS.join(' or ')}`, (val) => {
        if (SUB_COMMANDS.includes(val)) return val
        // if the value isn't in the array, throw an error
        throw new Error(`The subcommand must be either ${SUB_COMMANDS.join(' or ')}`)
      })
      .argument('[metric]', 'name of the metric')
      .argument('[timerange]', 'maximum history to retrieve')
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
      .option('-s --source', 'Only fetch metrics from a specific source (collector, nodejs or golang)', null, null, false)
      .option('-w --webcheck', 'Only fetch metrics from a specific webcheck', null, null, false)
      .option('-c --collector', 'Only fetch metrics from a specific collector (prometheus)', null, null, false)
      .option('--by-apps', 'Aggregate by application instead of server', this.cli.BOOL, false, false)
      .action(this.launch.bind(this))
    return this.cli
  }

  async launch (args, opts) {
    // handle the case where its regex
    if (utils.isRegex(opts.servers)) {
      let servers = await utils.findServerFromRegex(this.km, opts)
      console.log(`Resolved server regex (${opts.servers}) into ${servers}`)
      opts.servers = servers
    }
    if (utils.isRegex(opts.apps)) {
      let apps = await utils.findAppFromRegex(this.km, opts)
      console.log(`Resolved app regex (${opts.apps}) into ${apps}`)
      opts.apps = apps
    }

    // we need to build array of apps and servers where the metric is
    switch (args.subcommand) {
      case 'list': {
        await this.launchList(args, opts)
        break
      }
      case 'graph': {
        if (typeof args.metric !== 'string') {
          throw new Error(`You must define the name of the metrics you want to graph`)
        } else if (typeof args.timerange !== 'string') {
          throw new Error(`You must define the timerange for the graph`)
        }
        await this.launchGraph(args, opts)
        break
      }
    }
  }

  async launchList (args, opts) {
    const Table = require('tty-table')
    const headers = [
      {
        value: 'Name',
        width: 40
      },
      {
        value: 'Initiator',
        width: 20
      },
      {
        value: 'Source',
        width: 80
      }
    ]
    const res = await this.km.data.metrics.retrieveList(opts.bucket, {
      servers: opts.servers,
      apps: opts.apps,
      collector: opts.collector,
      webcheck: opts.webcheck,
      initiator: opts.source
    })
    const metrics = res.data.filter(metric => typeof metric.initiator === 'string')

    let rows = []
    // build the rows
    for (let metric of metrics) {
      rows.push([
        metric.name,
        metric.initiator,
        await utils.getSourceFromMetric(this.km, opts, metric)
      ])
    }
    var t1 = Table(headers, rows)
    // render it
    console.log(t1.render())
  }

  async launchGraph (args, opts) {
    // lazy load big dependencies
    const blessed = require('blessed')
    const contrib = require('blessed-contrib')
    const randomColor = () => {
      return [Math.random() * 255, Math.random() * 255, Math.random() * 255]
    }
    let metric = args.metric
    const isMetricInBytes = metric === 'memory'

    const res = await this.km.data.metrics.retrieveAggregations(opts.bucket, {
      aggregations: [
        {
          name: metric,
          start: args.timerange,
          apps: opts.app,
          servers: opts.servers,
          types: ['histogram', opts.byServers === true ? 'servers' : 'apps']
        }
      ]
    })
    let aggregation = res.data[0]
    let series = []
    // build series
    let aggregationType = `by_${opts.byServers === true ? 'server' : 'app'}`
    for (let server of aggregation[aggregationType].buckets) {
      series.push({
        title: server.key,
        x: server.histogram.buckets.map(point => {
          return moment(point.key_as_string).format('DD/MM HH') + 'h'
        }),
        y: server.histogram.buckets.map(point => {
          return isMetricInBytes ? point.stats.avg / 1024 / 1024 : point.stats.avg
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
  }
}
