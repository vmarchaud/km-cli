
'use strict'

const utils = require('../utils')
const async = require('async')

module.exports = class TriggerCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli

    // register the command
    this.cli
      .command('trigger', 'trigger a function inside processes')
      .argument('<name>', 'name of the function to trigger')
      .complete(() => {
        return new Promise((resolve, reject) => {
          this.km.data.status.retrieve(opts.bucket).then(res => {
            let servers = res.data
            let functions = new Set()
            servers.forEach(server => {
              server.data.process.forEach(process => {
                process.axm_actions.forEach(action => {
                  functions.add(action.action_name)
                })
              })
            })
            return resolve(Array.from(functions))
          }).catch(reject)
        })
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
      .option('-a --apps', 'Only get status from these apps', null, null, false)
      .option('-s --servers', 'Only get status from these servers', null, null, false)
      .action(this.launch.bind(this))
    return this.cli
  }

  launch (args, opts) {
    // we will need to build an array of actions to trigger for each process
    let actions = []
    let functionName = args.name
    this.km.data.status.retrieve(opts.bucket).then(res => {
      let servers = res.data
      servers.forEach(server => {
        server.data.process.forEach(process => {
          process.axm_actions.forEach(action => {
            if (action.action_name !== functionName) return
            // if the function is available on the process
            actions.push({
              action_name: functionName,
              server_name: server.server_name,
              app_name: process.name,
              process_id: process.pm_id
            })
          })
        })
      })
      if (actions.length === 0) {
        return console.log(`- Found 0 apps with action ${functionName}`)
      }
      // then we need to filter them based on the filters
      // filter either by regex or full match
      if (utils.isRegex(opts.apps)) {
        actions = actions.filter(action => {
          return action.app_name.match(new RegExp(utils.cleanRegex(opts.apps)))
        })
      } else if (opts.apps) {
        actions = actions.filter(action => {
          return action.app_name === opts.apps
        })
      }
      // filter either by regex or full match
      if (utils.isRegex(opts.servers)) {
        actions = actions.filter(action => {
          return action.server_name.match(new RegExp(utils.cleanRegex(opts.servers)))
        })
      } else if (opts.servers) {
        actions = actions.filter(action => {
          return action.server_name === opts.servers
        })
      }
      let start = Date.now()
      async.map(actions, (action, next) => {
        console.log(`- Action on ${action.app_name} id ${action.process_id} on server ${action.server_name} launched`)
        this.km.actions.triggerAction(opts.bucket, action).then(res => {
          console.log(`- Action on ${action.app_name} id ${action.process_id} on server ${action.server_name} executed : code ${res.status}`)
          return next()
        }).catch(next)
      }, (err, resuls) => {
        if (err) {
          console.error(`Error while sending actions :`)
          return console.error(err.stack)
        }
        let nbrOfApps = actions.reduce((agg, val) => {
          return !agg.includes(val.app_name) ? agg.concat([val.app_name]) : agg
        }, [])
        let nbrOfServers = actions.reduce((agg, val) => {
          return !agg.includes(val.server_name) ? agg.concat([val.server_name]) : agg
        }, [])
        console.log(`- Succesfully exectuted on ${nbrOfApps.length} apps and ${nbrOfServers.length} servers in ${Date.now() - start} ms`)
      })
    }).catch(err => {
      console.error(`Error while retrieving status :`)
      console.error(err.stack)
    })
  }
}
