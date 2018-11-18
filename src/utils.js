
'use strict'

const exec = require('child_process').exec
const inquirer = require('inquirer')

module.exports = class Utils {
  static isRegex (val) {
    return typeof val === 'string' && val[0] === '/' && val[val.length - 1] === '/'
  }

  static cleanRegex (val) {
    return val.replace(/\//gi, '')
  }

  static validateAppServerFilter (val) {
    if (val === false) return []

    if (val.indexOf(',') > -1) {
      return val.split(',')
    } else if (Utils.isRegex(val)) {
      return val
    } else {
      return [ val ]
    }
  }

  static errorHandler (err) {
    console.log(`An error has happened`)
    console.error(err)
    process.exit(-1)
  }

  static humanizeBytes (num) {
    const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    if (!Number.isFinite(num)) {
      throw new TypeError(`Expected a finite number, got ${typeof num}: ${num}`)
    }

    const neg = num < 0

    if (neg) num = -num

    if (num < 1) {
      return (neg ? '-' : '') + num + ' B'
    }

    const exponent = Math.min(Math.floor(Math.log10(num) / 3), UNITS.length - 1)
    const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3))
    const unit = UNITS[exponent]

    return (neg ? '-' : '') + numStr + ' ' + unit
  }

  static completeAppNames (km, opts) {
    return new Promise((resolve, reject) => {
      this.km.data.status.retrieve(opts.bucket).then(res => {
        const servers = res.data
        const apps = servers.reduce((agg, server) => {
          server.data.process.forEach(process => {
            if (!agg.has(process.name)) {
              agg.add(process.name)
            }
          })
          return agg
        }, new Set())
        return resolve(Array.from(apps))
      }).catch(reject)
    })
  }

  static completeServersNames (km, opts) {
    return new Promise((resolve, reject) => {
      this.km.data.status.retrieve(opts.bucket).then(res => {
        let servers = res.data
        return resolve(servers.map(server => server.server_name))
      }).catch(reject)
    })
  }

  static async findServerFromRegex (km, opts) {
    const res = await km.data.status.retrieve(opts.bucket)
    const servers = res.data
    const reg = new RegExp(this.cleanRegex(opts.servers), 'gi')
    const matched = servers
      .filter(server => reg.test(server.server_name))
      .map(server => server.server_name)
    // yes because a normal behavior would tell that if the regex doesn't match
    // we shouldn't have result, if we send nothing as filter we will have everything
    return matched.length > 0 ? matched : [ '1mposs1bleToF1nd' ]
  }

  static async findAppFromRegex (km, opts) {
    const res = await km.data.status.retrieve(opts.bucket)
    const servers = res.data
    // compute the list of apps
    let apps = servers
      .map(server => server.data.process.map(process => process.name))
      .reduce((set, apps) => {
        apps.forEach(app => {
          set.add(app)
        })
        return set
      }, new Set())
    apps = Array.from(apps)
    const reg = new RegExp(this.cleanRegex(opts.apps), 'gi')
    const matched = apps
      .filter(app => reg.test(app))
    // yes because a normal behavior would tell that if the regex doesn't match
    // we shouldn't have result, if we send nothing as filter we will have everything
    return matched.length > 0 ? matched : [ '1mposs1bleToF1nd' ]
  }

  static async getSourceFromMetric (km, opts, metric) {
    switch (metric.initiator) {
      case 'nodejs': {
        return `nodejs/${metric.process.server}/${metric.process.name}/${metric.process.pm_id}`
      }
      case 'golang': {
        return `golang/${metric.process.server}/${metric.process.name}/${metric.process.pm_id}`
      }
      case 'webcheck': {
        const { data } = await km.bucket.webchecks.get(opts.bucket, metric.metadata.webcheck)
        return `webcheck/${data.name}`
      }
      case 'collector': {
        return `collector/${metric.metadata.collector}`
      }
    }
    return 'undefined'
  }

  static async resolveProcessToProfile (km, opts) {
    const res = await km.data.status.retrieve(opts.bucket)
    const availables = res.data.filter(server => {
      return server.data.active !== false && server.active !== false
    }).filter(server => {
      return opts.servers.length === 0 || opts.servers.includes(server.server_name)
    }).map(server => {
      return server.data.process.filter(process => {
        return process.status === 'online'
      }).filter(process => {
        return opts.apps.length === 0 || opts.apps.includes(process.name)
      }).map(process => {
        return {
          pm_id: process.pm_id,
          name: process.name,
          server: server.server_name
        }
      })
    })
    return Array.prototype.concat(...availables)
  }

  static async askWithChoices (question, choices) {
    const res = await inquirer.prompt({
      type: 'list',
      name: 'random',
      message: question,
      choices
    })
    return res.random
  }

  static timeSince (date) {
    var seconds = Math.floor((new Date() - date) / 1000)
    var interval = Math.floor(seconds / 31536000)

    if (interval > 1) {
      return interval + 'Y'
    }
    interval = Math.floor(seconds / 2592000)
    if (interval > 1) {
      return interval + 'M'
    }
    interval = Math.floor(seconds / 86400)
    if (interval > 1) {
      return interval + 'D'
    }
    interval = Math.floor(seconds / 3600)
    if (interval > 1) {
      return interval + 'h'
    }
    interval = Math.floor(seconds / 60)
    if (interval > 1) {
      return interval + 'm'
    }
    return Math.floor(seconds) + 's'
  }

  static open (target, appName, callback) {
    let opener
    const escape = function (s) {
      return s.replace(/"/g, '\\"')
    }

    if (typeof (appName) === 'function') {
      callback = appName
      appName = null
    }

    switch (process.platform) {
      case 'darwin': {
        opener = appName ? `open -a "${escape(appName)}"` : `open`
        break
      }
      case 'win32': {
        opener = appName ? `start "" ${escape(appName)}"` : `start ""`
        break
      }
      default: {
        opener = appName ? escape(appName) : `xdg-open`
        break
      }
    }

    if (process.env.SUDO_USER) {
      opener = 'sudo -u ' + process.env.SUDO_USER + ' ' + opener
    }
    return exec(`${opener} "${escape(target)}"`, callback)
  }
}
