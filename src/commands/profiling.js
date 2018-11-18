'use strict'

const utils = require('../utils')
const Table = require('tty-table')
const moment = require('moment')

const SUB_COMMANDS = [ 'list', 'create', 'show', 'download' ]

const typesMap = {
  'cpu': 'cpuprofile',
  'heap': 'heapprofile',
  'snapshot': 'heapsnapshot'
}

const actionsMap = {
  'cpuprofile': 'km:cpu:profiling:start',
  'heapprofile': 'km:heap:sampling:start',
  'heapsnapshot': 'km:heapdump'
}

module.exports = class ProfilingCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('profiling', 'list metrics or actions possible for processes')
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
      .option('-a --apps', 'Filter for these apps', utils.validateAppServerFilter)
      .option('-s --servers', 'Filter for these servers', utils.validateAppServerFilter)
      .option('--type', 'List specific profiling type / create a specific profile')
      .option('--page', 'Paginate when fetching profiles')
      .option('--id', 'id of the profiling')
      .option('--duration', 'wanted duration for the profiling')
      .option('--no-open', 'dont open the ui directly when showing a profile')
      .action(this.launch.bind(this))
    return this.cli
  }

  async launch (args, opts) {
    if (utils.isRegex(opts.servers)) {
      opts.servers = await utils.findServerFromRegex(this.km, opts)
    }
    if (utils.isRegex(opts.apps)) {
      opts.apps = await utils.findAppFromRegex(this.km, opts)
    }
    // allow for profile alias, so people can use "cpu" instead of "cpuProfile"
    if (opts.type && typesMap[opts.type]) {
      opts.type = typesMap[opts.type]
    }

    switch (args.subcommand) {
      case 'list': {
        await this.launchList(args, opts)
        break
      }
      case 'create': {
        if (typeof opts.type !== 'string') {
          throw new Error(`You must choose an type of profiling to run:
            km profile create --type=cpu --duration=10000
          `)
        }
        if (typeof opts.duration !== 'string') {
          throw new Error(`You must choose a duration for the profile:
            km profile create --type=cpu --duration=10000
          `)
        }
        await this.launchCreate(args, opts)
        break
      }
      case 'show': {
        if (typeof opts.id !== 'string') {
          throw new Error(`You must choose an id to show the profiling:
            km profile show --id=AWcXhoFHaLqEhTEtV9GZ
          `)
        }
        await this.launchShow(args, opts)
        break
      }
      default: {
        console.log('not found')
      }
    }
  }

  async getSourceFromProfile (profile) {
    return `${profile.process.server}/${profile.process.name}/${profile.process.pm_id}`
  }

  async launchList (args, opts) {
    const headers = [
      {
        value: 'ID',
        width: 25
      },
      {
        value: 'Type',
        width: 15
      },
      {
        value: 'Source',
        width: 40
      },
      {
        value: 'Duration (m)',
        width: 14
      },
      {
        value: 'Initiated',
        width: 14
      }
    ]
    const res = await this.km.data.profiling.list(opts.bucket, {
      from: (opts.page || 0) * 10,
      limit: 10,
      type: opts.type,
      apps: opts.apps,
      servers: opts.servers
    })
    const data = res.data
    let rows = []
    // build the rows
    for (let profile of data.data) {
      rows.push([
        profile.id,
        profile.type,
        await this.getSourceFromProfile(profile),
        moment.utc(moment.duration(profile.duration).as('milliseconds')).format('mm:ss'),
        profile.initiated
      ])
    }
    var t1 = Table(headers, rows)
    // render it
    console.log(t1.render())
  }

  async getProfileLink (bucket, profile) {
    const name = profile.realtime === true ? profile.file : profile.filename
    switch (profile.type) {
      case 'heapsnapshot': {
        const profileURL = `https://api.cloud.pm2.io/api/bucket/${bucket}/data/profilings/${name}/download`
        return `https://heapviz.cloud.pm2.io/?access_token=${this.km._network.tokens.access_token}=2&file=${profileURL}`
      }
      default: {
        const profileURL = `https://api.cloud.pm2.io/api/bucket/${bucket}/data/profilings/${name}/download?access_token=${this.km._network.tokens.access_token}`
        const encoded = encodeURIComponent(profileURL)
        return `https://speedscope.cloud.pm2.io/#viewMode=2&profileURL=${encoded}`
      }
    }
  }

  async launchShow (args, opts) {
    try {
      const res = await this.km.data.profiling.retrieve(opts.bucket, args.id)
      const url = await this.getProfileLink(opts.bucket, res.data)
      utils.open(url, (err) => {
        if (err) {
          console.error(`Failed to open url`, err.message)
          console.log(`You can still open the profile there :`, url)
          return
        }
        console.log(`Succesfully open the profile in the UI`)
      })
    } catch (err) {
      const msg = err.data.msg
      console.error(msg)
      process.exit(1)
    }
  }

  async launchCreate (args, opts) {
    const processes = await utils.resolveProcessToProfile(this.km, opts)
    const availablesServers = Array.from(processes.reduce((set, process) => {
      return set.add(process.server)
    }, new Set()))
    const server = availablesServers.length === 1 ? availablesServers[0] : await utils.askWithChoices('Select a server:', availablesServers)
    const availablesApps = Array.from(processes
      .filter(process => process.server === server)
      .reduce((set, process) => {
        return set.add(process.name)
      }, new Set()))
    const app = availablesApps.length === 1 ? availablesApps[0] : await utils.askWithChoices('Select an app:', availablesApps)
    const availablesProcess = Array.from(processes
      .filter(process => process.server === server)
      .filter(process => process.name === app)
      .reduce((set, process) => {
        return set.add(process.pm_id.toString())
      }, new Set()))
    const processId = availablesProcess.length === 1 ? availablesProcess[0] : await utils.askWithChoices('Select a process id:', availablesProcess)
    console.log(`Selected Process ${processId} of app ${app} on server ${server} for ${opts.type} profiling during ${opts.duration}ms`)
    const res = await this.km.actions.triggerAction(opts.bucket, {
      server_name: server,
      app_name: app,
      process_id: processId,
      action_name: actionsMap[opts.type],
      opts: {
        timeout: parseInt(opts.duration),
        initiated: 'manual'
      }
    })
    if (res.status !== 200) {
      console.error(`Failed to launch the profile action`, res.data)
      return process.exit(1)
    }
    this.km.realtime.once(`*:${server}:profiling`, async (profile) => {
      profile.realtime = true
      const url = await this.getProfileLink(opts.bucket, profile)

      if (opts.noOpen) {
        console.log(`Here is the link to the UI: ${url}

          Otherwise, here the link to download it directly: ${profile.filename}?${this.km._network.tokens.access_token}`)
      } else {
        utils.open(url, _ => {})
        console.log(`Succesfully opened the profile in the UI`)
      }
      await this.km.realtime.unsubscribe(opts.bucket)
    })
    await this.km.realtime.subscribe(opts.bucket)
  }
}
