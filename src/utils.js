
'use strict'

module.exports = class Utils {
  static isRegex (val) {
    return typeof val === 'string' && val[0] === '/' && val[val.length - 1] === '/'
  }

  static cleanRegex (val) {
    return val.replace(/\//gi, '')
  }

  static validateAppServerFilter (val) {
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
}
